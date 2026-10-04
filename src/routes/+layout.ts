/**
 * The app is a client-side SPA: all of its data lives in IndexedDB, so there
 * is nothing for a server to render. Prerender produces the static shell for
 * each known route; `ssr: false` stops the build rendering empty states into
 * that shell.
 */
export const prerender = true;
export const ssr = false;
