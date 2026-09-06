export function loadMediaChrome() {
	return Promise.all([
		// Defer importing & registering custom media elements until actual usage
		import('media-chrome'),
		import('media-chrome/menu')
	])
}
