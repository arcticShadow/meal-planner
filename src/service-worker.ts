/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import { shouldPrecache } from '$lib/precache';

/**
 * Offline support.
 *
 * The app claims to work without a connection, and before this it only did so
 * when the browser happened to still hold the files in its HTTP cache — which
 * is not a guarantee, and is exactly the kind of thing that fails in a
 * supermarket basement. Precaching the shell makes the claim true, and makes
 * the app installable to a home screen.
 */

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;

/**
 * What to download on install.
 *
 * `build` is the compiled JS/CSS, content-hashed and safe to cache forever.
 * `files` is everything in static/ — which includes ~40MB of recipe photos.
 * Precaching those would mean a first visit costs 40MB of someone's mobile
 * data for pictures they may never look at, so images are left out and cached
 * as they are actually viewed. The shell and the recipe packs, which are what
 * "works offline" actually depends on, are small and go in up front.
 */
const PRECACHE = [...build, ...files.filter(shouldPrecache)];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			// Build artefacts are content-addressed, so a hit is always current.
			if (PRECACHE.includes(url.pathname)) {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
			}

			try {
				const response = await fetch(request);
				// Opaque and error responses must not be cached as if they were
				// the real thing, or a transient failure becomes permanent.
				if (response.ok && response.type === 'basic') {
					cache.put(request, response.clone());
				}
				return response;
			} catch {
				const hit = await cache.match(request);
				if (hit) return hit;

				// A navigation that misses falls back to the shell, which boots
				// the client router and renders from IndexedDB.
				if (request.mode === 'navigate') {
					const shell = await cache.match('/404.html');
					if (shell) return shell;
				}
				throw new Error('Offline and not cached');
			}
		})()
	);
});
