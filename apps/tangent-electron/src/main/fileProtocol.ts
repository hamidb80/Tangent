import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { app, protocol } from 'electron'

import Logger from 'js-logger'
import { FILE_PROTOCOL, getFilePathFromUrl } from 'common/fileUrl'

const log = Logger.get('file-protocol')

/**
 * Content types for everything the renderer can embed. This deliberately
 * mirrors the extension lists in `common/fileExtensions`; anything that becomes
 * embeddable there needs an entry here or it will be served as a download.
 *
 * Fonts are included because user style sheets can pull them in.
 */
const contentTypes: { [extension: string]: string } = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.bmp': 'image/bmp',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',

	'.mp3': 'audio/mpeg',
	'.m4a': 'audio/mp4',
	'.wav': 'audio/wav',
	'.ogg': 'audio/ogg',
	'.flac': 'audio/flac',

	'.mov': 'video/quicktime',
	'.mp4': 'video/mp4',
	'.mkv': 'video/x-matroska',
	'.avi': 'video/x-msvideo',
	'.webm': 'video/webm',

	'.pdf': 'application/pdf',
	'.css': 'text/css',

	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf'
}

function getContentType(filepath: string) {
	return contentTypes[path.extname(filepath).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Origins allowed to `fetch()` workspace files.
 */
function isAllowedOrigin(origin: string) {
	// null origin is `file://`
	if (!origin || origin === 'null') return true
	if (origin === 'app://tangent') return true
	return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function getCorsHeaders(origin: string) {
	if (!origin) return {}
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Headers': 'Range, Content-Type',
		// pdf.js reads these back when it loads a document in pieces
		'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
	}
}

/**
 * Parses a single byte range header against a known file size.
 *
 * Multi-range requests are not supported; browsers do not send them for media
 * playback, which is the only thing that asks for ranges here.
 *
 * @returns The inclusive byte range, or null if the header was absent or
 * unsatisfiable, in which case the whole file should be sent.
 */
export function parseRange(header: string, size: number): { start: number, end: number } {
	if (!header) return null

	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
	if (!match) return null

	const [, rawStart, rawEnd] = match
	let start: number
	let end: number

	if (rawStart === '') {
		// A suffix range asks for the last N bytes
		if (rawEnd === '') return null
		const length = parseInt(rawEnd, 10)
		if (!(length > 0)) return null
		start = Math.max(0, size - length)
		end = size - 1
	}
	else {
		start = parseInt(rawStart, 10)
		end = rawEnd === '' ? size - 1 : Math.min(parseInt(rawEnd, 10), size - 1)
	}

	if (!(start >= 0) || !(end >= start) || start >= size) return null

	return { start, end }
}

function streamFile(filepath: string, range?: { start: number, end: number }) {
	// Streaming rather than reading the whole file keeps large videos from
	// being pulled into memory on every seek.
	const stream = fs.createReadStream(filepath, range ? { start: range.start, end: range.end } : undefined)
	return Readable.toWeb(stream) as ReadableStream
}

/**
 * Sets up the `tangent-file` protocol. Must be called before the app is ready.
 */
export function registerSchemes() {
	protocol.registerSchemesAsPrivileged([
		{
			// The file protocol exists to:
			// 	1. Support file access in a vite dev environment
			//	2. Support `Content-Range` headers for video files.
			scheme: FILE_PROTOCOL,
			privileges: {
				// Gives the scheme normal url parsing and a real origin
				standard: true,
				// Keeps it from being treated as insecure content
				secure: true,
				// pdf.js loads documents with `fetch()`
				supportFetchAPI: true,
				// Without this, a cross origin `fetch()` is refused before our
				// handler ever gets to answer it
				corsEnabled: true,
				// Required for the range requests that `<video>` seeking needs
				stream: true
			}
		}
	])

	app.whenReady().then(() => {
		// For whatever reason, electron requires this split (so says Claude anyways)
		protocol.handle(FILE_PROTOCOL, handleFileProtocol)
	})
}

async function handleFileProtocol(request: Request) {
	let filepath: string
	try {
		filepath = getFilePathFromUrl(request.url)
	}
	catch (e) {
		log.error('Could not interpret file url:', request.url)
		return new Response(null, { status: 400 })
	}

	const origin = request.headers.get('Origin')
	if (!isAllowedOrigin(origin)) {
		log.warn('Blocked a file request from an unexpected origin:', origin, request.url)
		return new Response(null, { status: 403 })
	}

	const corsHeaders = getCorsHeaders(origin)

	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders })
	}

	let stats: fs.Stats
	try {
		stats = await fs.promises.stat(filepath)
		if (!stats.isFile()) {
			throw new Error('Not a file')
		}
	}
	catch (e) {
		log.error('Could not read file:', filepath, e)
		return new Response(null, { status: 404, headers: corsHeaders })
	}

	const headers = new Headers({
		...corsHeaders,
		'Content-Type': getContentType(filepath),
		'Accept-Ranges': 'bytes'
	})

	const range = parseRange(request.headers.get('Range'), stats.size)

	if (range) {
		headers.set('Content-Length', (range.end - range.start + 1).toString())
		headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stats.size}`)
		return new Response(streamFile(filepath, range), { status: 206, headers })
	}

	headers.set('Content-Length', stats.size.toString())
	return new Response(streamFile(filepath), { status: 200, headers })
}
