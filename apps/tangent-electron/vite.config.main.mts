import path from 'path'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { visualizer } from 'rollup-plugin-visualizer'

const root = import.meta.dirname

/** See the note in the renderer config. `VISUALIZE_MAIN=1 npm run build` */
const visualize = Boolean(process.env.VISUALIZE_MAIN)

/**
 * The main process config
 */
export default defineConfig({
	build: {
		ssr: path.join(root, 'src/main/index.ts'),
		outDir: path.join(root, '__build/main'),
		emptyOutDir: true,
		sourcemap: true,
		target: 'node22',
		minify: false,
		rollupOptions: {
			output: {
				// Output is ESM for better module splitting potential
				format: 'es',
				// Use mjs so that the tangent-electron module can remain CJS
				entryFileNames: 'main.mjs',
				// Bundled CommonJS dependencies lazily `require` node builtins
				// from inside conditionals, which rollup cannot rewrite. ESM has
				// no `require`, so one is provided.
				banner: [
					"import { createRequire as __createRequire } from 'node:module'",
					"const require = __createRequire(import.meta.url)"
				].join('\n')
			}
		}
	},

	ssr: {
		// Dependencies are bundled, as they were under webpack. Externalizing
		// them is a worthwhile follow up, but it changes what lands in the asar
		// and wants its own packaging test.
		noExternal: true,
		external: [
			'electron',
			// Native, or otherwise unhappy about being bundled
			'fsevents',
			'font-list',
			'yargs',
			'yargs/helpers',
			'link-preview-js'
		]
	},

	plugins: [
		tsconfigPaths({
			projects: [path.join(root, 'tsconfig.json')]
		}),
		visualize && visualizer({
			filename: path.join(root, '__build/main_stats.html'),
			sourcemap: true,
			gzipSize: true,
			open: true, // Open by default since it must be asked for
		})
	]
})
