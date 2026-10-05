/**
 * Which build outputs the service worker downloads on install.
 *
 * Lives outside the worker so it can be tested: a service worker cannot be
 * imported by the test runner, and getting this wrong is expensive in a way
 * that would not show up until someone opened the app on mobile data.
 *
 * The rule is "everything the app needs to run offline, and nothing that is
 * merely nice to look at". The shell and the recipe packs are a megabyte and
 * are what offline actually depends on. The recipe photos are ~40MB, so they
 * are fetched and cached as they are viewed instead.
 */
const IMAGE_PATH = /\/recipe-images\//;

export function shouldPrecache(path: string): boolean {
	return !IMAGE_PATH.test(path);
}

/** Paths cached on first view rather than up front. */
export function isRuntimeCached(path: string): boolean {
	return IMAGE_PATH.test(path);
}
