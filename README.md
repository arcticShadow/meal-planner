# Meal Planner

Plan meals, get one combined shopping list, keep a recipe library — entirely offline, with no backend.

Live at **https://arcticshadow.github.io/meal-planner/**

## What it does

**Plan** meals onto a calendar. A meal covers a configurable number of days, so cooking once on Monday fills Monday and Tuesday; the covered days show as leftovers rather than looking free.

**Shop** from a single consolidated list. 600g of chicken on Monday and 600g on Wednesday becomes one line of 1.2kg, which expands to show both contributions with their dates — and lets you drop either one if you already have it.

**Share** a plan by link. The plan and the recipes it needs are compressed into the URL fragment, which browsers never send to a server, so a plan can be handed to someone else without anything being uploaded anywhere.

Everything is stored in IndexedDB in your browser. Nothing leaves the device unless you export it or share a link.

## Running it

```bash
npm install
npm run dev
```

| Command         |                                |
| --------------- | ------------------------------ |
| `npm run dev`   | Dev server                     |
| `npm run build` | Production build into `build/` |
| `npm test`      | Unit tests                     |
| `npm run check` | Type check                     |
| `npm run lint`  | Lint and format check          |

## Recipes

The app ships with an empty library on purpose — a meal planner prefilled with someone else's recipes is someone else's app. Import one from **Settings**:

- **Recipe card archive** — 227 recipes extracted from scanned Bargain Box cards, bundled at `static/packs/recipe-cards.json`.
- **From a file** — any recipe pack, or a backup you exported earlier.

Importing again only adds what you do not already have, so it never duplicates the library or overwrites your edits.

### The dataset pipeline

`pdf_to_recipe/` turns scanned PDFs into raw recipe JSON using a vision model. That output is structurally consistent but semantically rough, so `tools/dataset/normalise.mjs` rebuilds it into a pack the app can trust:

```bash
node tools/dataset/normalise.mjs <raw-dir> static/packs/recipe-cards.json
```

It fixes the things that otherwise break the shopping list:

- **Quantities** arrive as free text — `"600g"`, `"1/2"`, `"2½"`, `"11/2"`, `"2-3"`, `"equal parts"` — and become a number plus a canonical unit. Ranges take the upper bound, because for a shopping list "2–3 cloves" means buy three. Anything genuinely unmeasurable keeps an explicit reason (`to taste`, `spice mix`) instead of being coerced to 1.
- **Units** collapse from 47 to 19, grouped into families so only comparable amounts ever add up. Mass and volume convert within themselves; count units stay separate, because guessing how many grams are in a clove puts a wrong number on a list you shop from.
- **Instructions** were split on PDF line wraps rather than on steps, leaving fragments like `"Combine boiling water and"` followed by `"measure of stock spices in a pot."`. They are rejoined and re-split on sentence boundaries, and the recipe cards' phase banners become headings.
- **Ingredient names** have their prep notes split off, so `"carrot, thinly sliced"` and `"carrot"` consolidate into one shopping line.

`src/lib/pack.test.ts` is a contract test over the shipped pack, so regenerating it cannot quietly reintroduce string quantities, unknown units or line-wrap fragments.

The original scans (228 PDFs, ~440 MB) are not in this repo and should not be — they are archived separately. Only the recipe text ships.

## How it is put together

|                           |                                                       |
| ------------------------- | ----------------------------------------------------- |
| `src/lib/types.ts`        | The data model                                        |
| `src/lib/units.ts`        | Unit families, conversion and formatting              |
| `src/lib/shopping.ts`     | Consolidation — the core of the app                   |
| `src/lib/dates.ts`        | Calendar maths, all in local time                     |
| `src/lib/share.ts`        | Encoding a plan into a link                           |
| `src/lib/state.svelte.ts` | Application state, mirrored to IndexedDB              |
| `src/service-worker.ts`   | Precaches the shell so offline actually means offline |

A few decisions worth knowing about:

**Dates never go through `toISOString()`.** Every date here is a calendar day, not an instant. `toISOString()` converts local time to UTC, so local midnight reports the previous day anywhere ahead of UTC — which silently shifts an entire meal plan back by one. `src/lib/dates.ts` stays in local time throughout and is tested across month ends, leap years and daylight-saving transitions.

**Consolidation under-merges on purpose.** A split line is a mild annoyance; a wrong merge sends you home without an ingredient.

**There is no peer-to-peer sync, deliberately.** An earlier version tried to sync two browsers over WebRTC with the offer in a QR code. That cannot work: the initiator never receives the answer SDP, so no ICE candidate pair ever forms, and the connection always times out. Reliable P2P needs a signalling server and a TURN relay for symmetric NATs, both of which the no-backend constraint rules out. Sharing a plan by link solves the actual problem — one person plans, the other receives — without any of that.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml`. The static adapter emits `404.html` as the SPA fallback, which is what GitHub Pages serves for unrecognised paths, so client-routed URLs like `/recipes/<id>` boot the app instead of dead-ending.
