import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// GitHub Pages serves the project at /<repo>, so assets and links need that
// prefix in production but not in dev.
const base = process.env.NODE_ENV === 'production' ? '/meal-planner' : '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			// GitHub Pages serves 404.html for any path it does not recognise,
			// which is what lets a client-routed URL like /recipes/<id> boot
			// the app instead of dead-ending.
			fallback: '404.html',
			precompress: false,
			strict: false
		}),
		paths: { base },
		prerender: {
			handleHttpError: 'warn',
			handleMissingId: 'warn'
		},
		serviceWorker: { register: true }
	}
};

export default config;
