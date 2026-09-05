import path from 'path'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tsconfigPaths from 'vite-tsconfig-paths'

const root = import.meta.dirname

/**
 * The renderer.
 *
 * The whole point of the layout here is that development and release have the
 * same shape. `src/app` holds the document, `static` is dropped in next to it,
 * and the build writes both plus the bundle into a single directory:
 *
 *     __build/renderer/
 *       index.html
 *       assets/*.js *.css *.woff2
 *       <everything from static/>
 *
 * In development vite serves that same arrangement from its dev server. Because
 * the document sits at the root of the tree in both cases, every url the app
 * builds at runtime -- `window.svg#minimize`, `./t-embed.css`, `./math.css` --
 * resolves the same way in both, with no build step rewriting anything.
 */
export default defineConfig({
	root: path.join(root, 'src/app'),
	publicDir: path.join(root, 'static'),

	build: {
		outDir: path.join(root, '__build/renderer'),
		emptyOutDir: true,
		sourcemap: true,
		target: 'chrome130'
	},

	plugins: [
		svelte({
			configFile: path.join(root, 'svelte.config.mjs')
		}),
		tsconfigPaths({
			projects: [path.join(root, 'tsconfig.json')]
		})
	],

	resolve: {
		// The defaults from https://vite.dev/config/shared-options.html#resolve-conditions
		// plus 'svelte', so that typewriter-editor's export map resolves
		conditions: ['module', 'browser', 'development|production', 'svelte']
	},

	server: {
		// Electron is the only client; picking a fixed port keeps the url stable
		port: 5199,
		strictPort: true
	}
})
