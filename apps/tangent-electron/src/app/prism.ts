// This is a virtual concept implemented by vite.config.renderer.mts
// It allows for lazily-loaded access to prism languages
import languageModules from 'virtual:prism-languages'
import { setLanguageLoader } from 'common/markdownModel/codeSyntax'

const loaders = new Map<string, () => Promise<unknown>>(Object.entries(languageModules))

// Svelte support lives in its own package rather than in prism itself
loaders.set('svelte', () => import('prism-svelte'))

setLanguageLoader(name => {
	const load = loaders.get(name)
	if (!load) {
		return Promise.reject(new Error(`No prism definition for "${name}"`))
	}
	return load()
})
