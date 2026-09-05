import { setNodePrism } from './src/common/markdownModel/codeSyntax'

/**
 * Outside a browser, prism's engine has to be handed to `codeSyntax` directly.
 * The main process does this at startup; tests parsing notes need the same
 * thing done for them, or code blocks quietly stop resolving their language.
 */
if (typeof window === 'undefined') {
	const Prism = (await import('prismjs')).default
	setNodePrism(Prism)
}
