const { exec, spawn } = require("child_process");
const fs = require('fs')
const path = require("path")

const AdmZip = require('adm-zip')

// TODO: Make this not a copy paste
const mode = process.env.NODE_ENV || 'production';
const prod = mode === 'production';

async function buildPrism() {
	// I hate how prism wants to be built, so I'm doing it myself
	// Prism is dropped into the public directory so that vite serves it in
	// development and copies it into the build, at the same url in both.
	// TODO: replace this with real imports so prism can be code split.
	const buildPath = path.resolve(path.join(__dirname, '../static', 'prism'))
	try {
		await fs.promises.stat(buildPath)
		console.log('Prism already built')
	}
	catch (e) {
		try {
			await fs.promises.mkdir(buildPath, { recursive: true })
			console.log('Building Prismjs')
			
			const prismNodePath = path.resolve(path.join(__dirname, '../../../node_modules', 'prismjs'))
			await fs.promises.copyFile(
				path.join(prismNodePath, 'prism.js'),
				path.join(buildPath, 'prism.js'))

			const languageBuildPath = path.join(buildPath, 'languages')
			await fs.promises.mkdir(languageBuildPath, { recursive: true })
			const componentsPath = (path.join(prismNodePath, 'components'))
			let componentFiles = await fs.promises.readdir(componentsPath)

			// Move core prism files
			await Promise.all(componentFiles.map(file => {
				if (file.endsWith('min.js')) {
					return fs.promises.copyFile(
						path.join(componentsPath, file),
						path.join(languageBuildPath, file))	
				}
			}))

			// Svelte support
			const prismSveltePath = path.resolve(path.join(__dirname, '../../../node_modules', 'prism-svelte', 'index.js'))
			await fs.promises.copyFile(prismSveltePath, path.join(languageBuildPath, 'prism-svelte.min.js')) // The "min" is a lie
		}
		
		catch (e) {
			console.error('Failed to build Prism', e)
		}
	}
}

async function buildDocumentation() {
	const buildPath = path.resolve(path.join(__dirname, '../__build', 'documentation.zip'))
	try {
		await fs.promises.stat(buildPath)
		console.log('Documentation already built')
	}
	catch (e) {
		const docPath = path.resolve(path.join(__dirname, '../../../Documentation'))
		
		// Copy to a new directory to do fixup
		const docClonePath = path.resolve(path.join(__dirname, '../__build', 'Documentation'))
		await fs.promises.cp(docPath, docClonePath, { recursive: true })

		// Clean files that shouldn't be distributed
		const rmArgs = { recursive: true, force: true }
		await fs.promises.rm(path.join(docClonePath, '.tangent', 'generated'), rmArgs)
		await fs.promises.rm(path.join(docClonePath, '.tangent', 'Temp'), rmArgs)
		await fs.promises.rm(path.join(docClonePath, '.tangent', 'tangents'), rmArgs)
		await fs.promises.rm(path.join(docClonePath, '.tangent', 'workspaces'), rmArgs)

		// Create the archive
		let zip = new AdmZip()
		zip.addLocalFolder(docClonePath)
		zip.writeZip(buildPath)

		// Remove temp directory
		await fs.promises.rm(docClonePath, rmArgs)
	}
}

function viteBuild(configName) {
	return async () => {
		const { build } = await import('vite')
		await build({
			configFile: path.resolve(path.join(__dirname, `../vite.config.${configName}.mts`)),
			mode
		})
	}
}

const buildMain = viteBuild('main')
const buildPreload = viteBuild('preload')

// `vite build` is production unless told otherwise, but `build:dev` expects an
// unminified renderer with svelte's dev warnings intact, hence passing `mode`.
// Vite is ESM only, so it cannot be `require`d from here.
const buildApp = viteBuild('renderer')

async function buildAll() {
	await buildMain()
	await buildPreload()

	await buildPrism()
	await buildDocumentation()

	let watcher = await buildApp()

	if (watcher) {
		return watcher
	}
}

module.exports = {
	buildApp,
	buildAll
}

if (require.main === module) {
	buildAll()
}
