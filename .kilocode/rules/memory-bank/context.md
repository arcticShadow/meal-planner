# Meal Planner - Current Context

## Project Status

**Status**: Rebuilt — core features working end to end
**Last Updated**: 2026-10-05

## Current State

The app is a SvelteKit 2 / Svelte 5 SPA on `adapter-static`, deployed to GitHub
Pages. All data lives in IndexedDB via Dexie; there is no backend and no
network dependency at runtime.

Working: recipe library with search and tag filters, meal planning on a
fortnight calendar with multi-day coverage, consolidated shopping list with
per-meal breakdown, pack import, backup export/restore, plan sharing by link,
offline precaching via a service worker.

## Recent Changes

- **Dropped WebRTC sync entirely** (~2,900 lines). The QR flow could never
  connect — the initiator never receives the answer SDP, so no ICE candidate
  pair forms. Reliable P2P needs a signalling server and a TURN relay, which
  the no-backend constraint rules out.
- **Replaced it with share links.** A plan plus the recipes it needs is gzipped
  into the URL fragment, which never reaches a server.
- **Rewrote the data model.** Amounts are numbers with a canonical unit;
  unmeasurable amounts carry a reason instead of being coerced to 1. Units are
  grouped into families so only comparable amounts add up.
- **Added a dataset normaliser** (`tools/dataset/normalise.mjs`) that rebuilds
  the raw `pdf_to_recipe` output into a trustworthy pack: parsing free-text
  quantities, collapsing 47 units to 19, and re-splitting instructions that had
  been broken on PDF line wraps.
- **Rebuilt the UI** mobile-first around the three places it is used: a
  supermarket aisle, a kitchen bench, and a sofa.
- **Fixed a timezone bug**: dates were going through `toISOString()`, which
  shifts local midnight to the previous day anywhere ahead of UTC.

## Key Conventions

- Calendar dates never go through `toISOString()` — use `src/lib/dates.ts`.
- Consolidation under-merges on purpose; a wrong merge loses an ingredient.
- Colour is semantic only: teal = primary action, green = bought, amber =
  needs review, red = destructive. Never decorative.
- The library ships empty; recipe packs are imported, never auto-loaded.

## Next Steps

1. Re-extract the 15 recipes whose titles failed OCR (they carry provisional
   names derived from ingredients and are flagged `needsReview`).
2. Decide whether to publish a recompressed image pack as a release asset.
3. Manual recipe entry and editing — currently recipes arrive only by import.
