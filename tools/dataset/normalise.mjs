#!/usr/bin/env node
/**
 * Normalise raw pdf_to_recipe output into a clean recipe pack.
 *
 * The raw extraction (one JSON per PDF, produced by tools in ../../pdf_to_recipe)
 * is structurally uniform but semantically messy: quantities are free text,
 * units are hallucinated, and instructions are split on PDF line wraps rather
 * than on steps. This rebuilds the set against the schema in src/lib/types.ts.
 *
 *   node tools/dataset/normalise.mjs <raw-dir> <out.json>
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/* ── units ──────────────────────────────────────────────────────────────── */

// Raw unit string -> canonical id. The canonical set and the conversion
// families that go with it live in src/lib/units.ts, which is what the app
// consumes; this map only has to get the raw data onto those ids.
//
// Anything not listed here is an extraction artefact carrying no quantity
// information — see SPICE_MIX_UNITS and VAGUE_UNITS below.
const UNIT_ALIASES = {
	g: 'g',
	gram: 'g',
	grams: 'g',
	kg: 'kg',
	ml: 'ml',
	l: 'l',
	tsp: 'tsp',
	teaspoon: 'tsp',
	tbsp: 'tbsp',
	tablespoon: 'tbsp',
	cup: 'cup',
	cups: 'cup',
	piece: 'piece',
	pieces: 'piece',
	clove: 'clove',
	cloves: 'clove',
	can: 'can',
	pack: 'pack',
	packet: 'pack',
	package: 'pack',
	'twin pack': 'pack',
	'pack (12 pack)': 'pack',
	'pack tortillas (12 pack)': 'pack',
	bag: 'bag',
	punnet: 'punnet',
	block: 'block',
	bunch: 'bunch',
	head: 'head',
	sachet: 'sachet',
	sachets: 'sachet',
	sheets: 'sheet',
	sheet: 'sheet',
	cakes: 'piece',
	large: 'piece',
	// A dice size ("diced 2cm") that leaked out of the name into the unit.
	cm: 'piece'
};

// Cards print the contents of a spice blend or a baking mix as a footnote,
// listed as "equal parts" with no amount. The extractor invented a unit for
// each one. None of them quantify anything.
const SPICE_MIX_UNITS = new Set([
	'part',
	'parts',
	'portion',
	'portions',
	'handful',
	'measure',
	'second measure',
	'george',
	'10g',
	'portion of flavour pack',
	'1/4 cup'
]);

// Units that describe an unmeasured gesture rather than an amount.
const VAGUE_UNITS = new Set(['drizzle', 'drizzle of', 'pinch', 'to taste', 'to serve']);

/* ── quantity parsing ───────────────────────────────────────────────────── */

const VULGAR = {
	'½': 0.5,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'¼': 0.25,
	'¾': 0.75,
	'⅕': 0.2,
	'⅗': 0.6,
	'⅙': 1 / 6,
	'⅛': 0.125,
	'⅜': 0.375,
	'⅝': 0.625,
	'⅞': 0.875
};

// Free-text quantities that mean "no measurable amount".
const UNQUANTIFIED = {
	null: 'to taste',
	'': 'to taste',
	'n/a': 'to taste',
	optional: 'to taste',
	'to taste': 'to taste',
	'to serve': 'to serve',
	pinch: 'to taste',
	drizzle: 'to taste',
	little: 'to taste',
	'a little': 'to taste',
	'as needed': 'to taste',
	remaining: 'remaining',
	equal: 'from a mix',
	'equal part': 'from a mix',
	'equal parts': 'from a mix'
};

/** Expand vulgar fractions to ASCII so one numeric parser handles everything. */
function expandVulgar(s) {
	let out = '';
	for (const ch of s) {
		if (VULGAR[ch] !== undefined) {
			// Keep a separator so "2½" becomes "2 0.5" and sums, not "20.5".
			out += (out && /\d$/.test(out) ? ' ' : '') + VULGAR[ch];
		} else {
			out += ch;
		}
	}
	return out;
}

/**
 * Parse one numeric token: "2", "1.5", "1/2", "1 1/2", "11/2" (= 1½).
 * Returns null when the token is not numeric.
 */
function parseNumber(tok) {
	const s = tok.trim().replace(/\s*\/\s*/g, '/');
	if (!s) return null;

	// "1 1/2" / "2 0.5" — a whole part followed by a fractional part.
	const mixed = s.match(/^(\d+)\s+(\d+\/\d+|\d*\.\d+)$/);
	if (mixed) {
		const freq = parseNumber(mixed[2]);
		return freq === null ? null : Number(mixed[1]) + freq;
	}

	const frac = s.match(/^(\d+)\/(\d+)$/);
	if (frac) {
		const [, n, d] = frac;
		// "11/2" and "13/4" are OCR'd mixed numbers, not improper fractions:
		// a leading 1 glued to a common fraction. 11/2 -> 1½, not 5.5.
		if (n.length === 2 && n[0] === '1' && Number(n[1]) < Number(d)) {
			return 1 + Number(n[1]) / Number(d);
		}
		return Number(d) === 0 ? null : Number(n) / Number(d);
	}

	if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
	return null;
}

/**
 * Parse a raw quantity string, which may also carry its own unit
 * ("600g", "1/2 cup", "1 twin pack") and may be a range ("2-3").
 *
 * Returns { amount, unit, approx, note }. `amount` is null when the text
 * carries no measurable quantity; `unit` is null when none was embedded.
 */
function parseQuantity(raw) {
	const text = String(raw ?? '')
		.trim()
		.replace(/\s+/g, ' ');
	const lower = text.toLowerCase();

	if (lower in UNQUANTIFIED) {
		return { amount: null, unit: null, note: UNQUANTIFIED[lower] };
	}

	const expanded = expandVulgar(text);

	// Range: take the upper bound. For a shopping list, "2-3 cloves" means buy 3.
	const range = expanded.match(/^(.+?)\s*-\s*(.+)$/);
	if (range) {
		const hi = parseQuantityScalar(range[2]);
		const lo = parseQuantityScalar(range[1]);
		// "1-1" and friends collapse; keep whichever side actually parsed.
		const pick = hi.amount !== null ? hi : lo;
		if (pick.amount !== null) {
			return { ...pick, unit: pick.unit ?? lo.unit ?? hi.unit, approx: true };
		}
	}

	return parseQuantityScalar(expanded);
}

/** Parse a non-range quantity, splitting any trailing embedded unit. */
function parseQuantityScalar(text) {
	const s = text.trim();

	// Split leading numeric run from a trailing unit: "600g", "2 1/4 cup".
	const m = s.match(/^([\d\s./]+?)\s*([a-zA-Z][a-zA-Z\s()]*)?$/);
	if (!m) return { amount: null, unit: null, note: 'to taste' };

	const amount = parseNumber(m[1]);
	const unitText = (m[2] || '').trim().toLowerCase();

	if (amount === null) return { amount: null, unit: null, note: 'to taste' };
	if (!unitText) return { amount, unit: null };

	if (VAGUE_UNITS.has(unitText)) return { amount: null, unit: null, note: 'to taste' };
	if (SPICE_MIX_UNITS.has(unitText)) return { amount: null, unit: null, note: 'from a mix' };

	return { amount, unit: UNIT_ALIASES[unitText] ?? null };
}

/* ── repeated ingredient blocks ─────────────────────────────────────────── */

/**
 * Bargain Box cards print the ingredient list once per household size, in
 * labelled "2 PEOPLE" / "4 PEOPLE" / "6 PEOPLE" panels. The extractor read
 * them as one flat list, so a recipe arrives with its ingredients repeated two
 * or three times at different scales — 300g, 600g and 900g of the same beef
 * mince. Left alone that is both unreadable and wrong: the shopping list would
 * tell you to buy 1.8kg.
 *
 * A second, different failure looks similar: on some cards the extractor also
 * re-listed ingredients it found mentioned in the method ("1 portion rice",
 * "1 measure sour cream"). Those carry no real quantity and are pure noise.
 *
 * Both are repeats of the opening ingredient, so both are found the same way;
 * what distinguishes them is whether the later blocks are *scaled* (serving
 * panels, keep the one matching the serving count) or *unquantified*
 * (instruction echo, keep the first block).
 *
 * This is deliberately conservative. Most recipes legitimately name an
 * ingredient twice — oil to fry and oil to dress, a first and second measure
 * of lemon — and those must survive untouched so the shopping list can sum
 * them. A split is only accepted when whole blocks line up.
 */

/** Units the extractor invents when echoing the method rather than the table. */
const ECHO_UNITS = new Set(['portion', 'measure', 'second measure', 'part', 'parts', 'handful']);

/** Candidate block starts: every later position repeating the first name. */
function blockStarts(names) {
	const starts = [0];
	for (let i = 1; i < names.length; i++) {
		if (names[i] === names[0]) starts.push(i);
	}
	return starts;
}

function overlap(a, b) {
	const setB = new Set(b);
	const shared = a.filter((n) => setB.has(n)).length;
	return shared / Math.max(1, Math.min(a.length, b.length));
}

/**
 * Split an ingredient list into repeated blocks plus a trailing remainder.
 * Returns null when the list is not a repeat — which is the common case.
 */
function findBlocks(ingredients) {
	const names = ingredients.map((i) =>
		String(i.name ?? '')
			.toLowerCase()
			.trim()
	);
	const starts = blockStarts(names);
	if (starts.length < 2) return null;

	// The tail is whatever follows the last block; a shared spice blend is
	// printed once, below the panels, so it belongs to every serving size.
	const blocks = starts.map((start, idx) => ({
		start,
		end: idx + 1 < starts.length ? starts[idx + 1] : names.length
	}));

	const first = names.slice(blocks[0].start, blocks[0].end);
	// A serving panel lists most of the recipe; a couple of repeated items is
	// not a panel.
	if (first.length < 4) return null;

	// Every block must be about the same size and list about the same things.
	// The final block may run long because the shared tail sits inside it.
	for (let i = 1; i < blocks.length; i++) {
		const block = names.slice(blocks[i].start, blocks[i].end);
		const sized = block.length >= first.length * 0.6;
		if (!sized) return null;
		const head = block.slice(0, first.length);
		if (overlap(first, head) < 0.6) return null;
	}

	// Trim the tail off the last block: anything past the first block's length
	// that does not continue the pattern is shared across all sizes.
	const last = blocks[blocks.length - 1];
	const tailStart = Math.min(last.start + first.length, names.length);
	const tail = ingredients.slice(tailStart);
	const panels = blocks.map((b, idx) =>
		ingredients.slice(b.start, idx === blocks.length - 1 ? tailStart : b.end)
	);

	return { panels, tail };
}

/** Word set of a name, for loose "is this the same ingredient" comparison. */
function tokens(name) {
	return new Set(
		String(name ?? '')
			.toLowerCase()
			.replace(/[^a-z0-9 ]/g, ' ')
			.split(/\s+/)
			.filter(Boolean)
	);
}

function subsetOf(a, b) {
	for (const t of a) if (!b.has(t)) return false;
	return true;
}

/**
 * Drop ingredients the extractor echoed out of the method text.
 *
 * These always arrive as a bare "1" with an invented unit ("1 portion rice",
 * "1 measure sour cream"). The ones that name something the ingredient table
 * already measures properly — rice, when 300g of Arborio rice is listed above
 * — are duplicates and go. The ones that name nothing else in the recipe are
 * the contents of a spice blend, which the card prints as a footnote, and
 * those stay: they are real, just unmeasured.
 */
function dropMethodEchoes(ingredients) {
	const measured = ingredients
		.filter((i) => !ECHO_UNITS.has(String(i.unit ?? '').toLowerCase()))
		.map((i) => tokens(i.name));

	return ingredients.filter((ing) => {
		const unit = String(ing.unit ?? '').toLowerCase();
		if (!ECHO_UNITS.has(unit) || String(ing.quantity ?? '') !== '1') return true;

		const mine = tokens(ing.name);
		if (!mine.size) return true;
		// Either direction counts: "rice" echoes "Arborio rice", and
		// "lemon juice" echoes "lemon".
		return !measured.some((other) => subsetOf(mine, other) || subsetOf(other, mine));
	});
}

/** True when a block carries no real measurements — an echo of the method. */
function isEcho(block) {
	const quantified = block.filter((i) => {
		const unit = String(i.unit ?? '').toLowerCase();
		const q = String(i.quantity ?? '');
		return !ECHO_UNITS.has(unit) && /\d/.test(q) && q !== '1';
	});
	return quantified.length <= block.length * 0.2;
}

/**
 * Reduce a repeated ingredient list to the single serving size the recipe
 * claims to be for. Returns the ingredients unchanged when no repeat is found.
 */
function dedupeServingPanels(ingredients, servings) {
	const found = findBlocks(ingredients);
	if (!found) return ingredients;

	const { panels, tail } = found;

	// Instruction echo: the later blocks measure nothing, so the first block is
	// the only real ingredient table.
	if (panels.slice(1).every(isEcho)) return [...panels[0], ...tail.filter((i) => !isEcho([i]))];

	// Serving panels run in ascending household size and the cards start at two
	// people, so "4 people" is the second panel. Fall back to the last panel,
	// which is never the smallest.
	const wanted = Math.round((Number(servings) || 4) / 2) - 1;
	const index = wanted >= 0 && wanted < panels.length ? wanted : panels.length - 1;
	return [...panels[index], ...tail];
}

/* ── ingredients ────────────────────────────────────────────────────────── */

/**
 * Split "carrot, cut in half lengthways & thinly sliced" into the shopping
 * name and the prep note. Consolidation keys off the name, so leaving prep
 * attached would stop two recipes' carrots from ever merging.
 */
const LEADING_UNIT =
	/^(cup|cups|pack|packet|can|tin|bag|punnet|block|bunch|head|sachet|portion|measure|drizzle|pinch)s?\s+(of\s+)?(?=[a-z])/i;

function splitPrep(rawName) {
	// The extractor sometimes leaves the unit glued to the front of the name,
	// giving "cup chicken stock" beside a unit of "cup".
	const name = String(rawName ?? '')
		.trim()
		.replace(LEADING_UNIT, '');
	const comma = name.indexOf(',');
	if (comma === -1) return { name, prep: undefined };
	return {
		name: name.slice(0, comma).trim(),
		prep: name.slice(comma + 1).trim() || undefined
	};
}

function normaliseIngredient(ing) {
	const { name, prep } = splitPrep(ing.name);
	const rawUnit = String(ing.unit ?? '')
		.trim()
		.toLowerCase();
	const q = parseQuantity(ing.quantity);

	// A unit embedded in the quantity ("600g") is more trustworthy than the
	// unit field, which is where the extractor put its guesses.
	let unit = q.unit;
	let note = q.note;

	if (!unit) {
		if (SPICE_MIX_UNITS.has(rawUnit)) {
			note = 'from a mix';
		} else if (VAGUE_UNITS.has(rawUnit)) {
			note = note ?? 'to taste';
		} else {
			unit = UNIT_ALIASES[rawUnit] ?? null;
		}
	}

	// A spice-mix or to-taste ingredient carries no amount, whatever was parsed.
	const unquantified = note === 'from a mix' || note === 'to taste' || note === 'to serve';
	const amount = unquantified ? null : q.amount;

	// "half a cauliflower" arrived as quantity 1, unit "half".
	const halved = rawUnit === 'half' ? 0.5 : null;

	const finalAmount = halved ?? amount;
	const out = {
		name,
		amount: finalAmount,
		// A unit without an amount measures nothing, so drop it rather than
		// leave "piece" hanging off a pinch of salt.
		unit: finalAmount === null ? null : halved ? 'piece' : (unit ?? 'piece')
	};
	if (prep) out.prep = prep;
	if (q.approx) out.approx = true;
	if (note) out.note = note;
	if (ing.optional) out.optional = true;
	return out;
}

/* ── instructions ───────────────────────────────────────────────────────── */

// My Food Bag prints each phase as an all-caps banner ("PREP IT", "COOK PASTA.").
// They survive extraction as their own array entries and make good headings.
const SECTION = /^[A-Z][A-Z0-9 '&!-]{2,}[.!]?$/;

/** True when a whole sentence is an all-caps phase banner, not prose. */
function isBanner(s) {
	const bare = s.replace(/[.!]+$/, '').trim();
	return bare.length >= 3 && bare.split(/\s+/).length <= 4 && SECTION.test(bare);
}

/**
 * Rebuild steps from line-wrapped fragments.
 *
 * The extractor emitted one array entry per printed line, so a single sentence
 * is spread across several entries ("Combine boiling water and" / "measure of
 * stock spices in a pot."). Rejoining the lines and re-splitting on sentence
 * boundaries recovers the real steps.
 *
 * Phase banners appear in two layouts across the set and both become headings:
 * on their own line ("COOK IT"), or inline ahead of the step they introduce
 * ("PREP ROLLS. While onions are cooking, slice hot dog rolls...").
 */
function normaliseInstructions(lines) {
	const blocks = [];
	let current = { heading: null, text: '' };

	for (const rawLine of lines ?? []) {
		const line = String(rawLine ?? '').trim();
		if (!line) continue;

		// A standalone banner has no trailing period, so the sentence splitter
		// would never break after it. Catch it here, while lines are intact.
		if (isBanner(line)) {
			if (current.text.trim()) blocks.push(current);
			current = { heading: toTitleCase(line), text: '' };
			continue;
		}
		current.text += (current.text ? ' ' : '') + line;
	}
	if (current.text.trim()) blocks.push(current);

	const steps = [];
	for (const block of blocks) {
		// Carry the block's banner onto its first step only.
		let pending = block.heading;
		for (const sentence of splitSentences(block.text.replace(/\s+/g, ' ').trim())) {
			// An inline banner splits off as its own sentence; it titles the next step.
			if (isBanner(sentence)) {
				pending = toTitleCase(sentence);
				continue;
			}
			steps.push(pending ? { heading: pending, text: sentence } : { text: sentence });
			pending = null;
		}
		// A banner with nothing after it is a decorative sign-off ("NICE.", "YUM!").
	}
	return steps;
}

/**
 * Split prose into sentences without breaking on the abbreviations and
 * measurements that fill recipe text (mins., approx., 180°C., 2.5cm).
 */
function splitSentences(text) {
	const parts = [];
	let buf = '';
	for (let i = 0; i < text.length; i++) {
		buf += text[i];
		if (text[i] !== '.' && text[i] !== '!' && text[i] !== '?') continue;

		const next = text.slice(i + 1, i + 3);
		// A sentence ends only when whitespace then a capital/digit follows.
		if (!/^\s+["'(]?[A-Z0-9]/.test(next)) continue;
		// "...for 2 mins. Add" is a real break, but "1.5cm" is not: a digit
		// immediately before and after the dot means it is a decimal point.
		if (/\d$/.test(buf.slice(0, -1)) && /^\s*$/.test(next[0] ?? '') === false) {
			/* fall through: handled by the whitespace test above */
		}
		const trimmed = buf.trim();
		if (trimmed.length > 2) {
			parts.push(trimmed);
			buf = '';
		}
	}
	if (buf.trim().length > 2) parts.push(buf.trim());
	return parts.length ? parts : text ? [text] : [];
}

function toTitleCase(s) {
	return s
		.replace(/[.!]+$/, '')
		.toLowerCase()
		.replace(/\b[a-z]/g, (c) => c.toUpperCase())
		.trim();
}

/* ── tags ───────────────────────────────────────────────────────────────── */

// 340 free-text tags across 227 recipes, many of them the same idea spelled
// differently. Fold the variants; everything else passes through slugged.
const TAG_ALIASES = {
	'one dish': 'one pot',
	'one pan': 'one pot',
	'one-pot': 'one pot',
	'family meal': 'family friendly',
	'family-friendly': 'family friendly',
	'kid friendly': 'family friendly',
	'kid-friendly': 'family friendly',
	'vegetarian-friendly': 'vegetarian',
	veggie: 'vegetarian',
	'quick meal': 'quick',
	'quick & easy': 'quick',
	'easy meal': 'easy',
	comfort: 'comfort food',
	'low-carb': 'low carb',
	'gluten-free': 'gluten free',
	'dairy-free': 'dairy free'
};

function normaliseTags(tags) {
	const seen = new Set();
	for (const t of tags ?? []) {
		const slug = String(t ?? '')
			.toLowerCase()
			.trim()
			.replace(/\s+/g, ' ');
		if (!slug) continue;
		seen.add(TAG_ALIASES[slug] ?? slug);
	}
	return [...seen].sort();
}

/* ── recipe ─────────────────────────────────────────────────────────────── */

const SCANNED_NAME = /^scanned[_\s-]*\d+/i;

function normaliseRecipe(raw, sourceFile) {
	const servings = Number(raw.servings) || 4;
	// Collapse the per-household-size panels before parsing, so the units and
	// amounts that survive are the ones for the serving count we keep.
	const ingredients = dropMethodEchoes(dedupeServingPanels(raw.ingredients ?? [], servings))
		.map(normaliseIngredient)
		.filter((i) => i.name);
	const instructions = normaliseInstructions(raw.instructions);
	const name = String(raw.name ?? '').trim();
	// Deliberately not flagged on repeated ingredient names: most recipes
	// legitimately list one twice (butter for the mash and butter for the
	// sauce), so that test produced far more false alarms than finds.
	const needsReview = SCANNED_NAME.test(name) || !instructions.length || !ingredients.length;

	return {
		id: slugify(name) || slugify(sourceFile),
		name,
		description: String(raw.description ?? '').trim(),
		category: String(raw.category ?? 'Dinner').trim(),
		tags: normaliseTags(raw.tags),
		servings,
		defaultDuration: Number(raw.defaultDuration) || 2,
		ingredients,
		instructions,
		images: (raw.images ?? []).map((i) => ({ src: String(i.src ?? '').replace(/^\.\//, '') })),
		...(needsReview ? { needsReview: true } : {}),
		source: sourceFile
	};
}

/* ── provisional naming ─────────────────────────────────────────────────── */

// Pantry staples say nothing about what a dish is, so they never name one.
const STAPLES =
	/^(oil|olive oil|sesame oil|butter|salt|pepper|sugar|brown sugar|water|boiling water|flour|cornflour|milk|egg|eggs|garlic|garlic clove|onion|brown onion|red onion|vinegar|soy sauce|stock|rice|jasmine rice|brown rice|pasta|bread|lemon|lime|honey|mayo|mayonnaise|tomato paste|carrot|potatoes?)$/i;

/**
 * Title the recipes whose name failed to extract (they arrive as
 * "Scanned_20250802-1346"). The rarest ingredients in the corpus are the ones
 * that distinguish a dish, so they make a serviceable provisional name. These
 * stay flagged `needsReview` for a human to correct against the scan.
 */
function nameFromIngredients(recipe, frequency) {
	const candidates = recipe.ingredients
		.map((i) => i.name)
		.filter((n) => n && !STAPLES.test(n.trim()) && n.length < 40)
		.map((n) => ({ name: n, freq: frequency.get(n.toLowerCase()) ?? 1 }))
		.sort((a, b) => a.freq - b.freq);

	const picked = [];
	for (const c of candidates) {
		// Skip near-duplicates ("chicken breast" after "diced chicken breast").
		if (picked.some((p) => p.includes(c.name) || c.name.includes(p))) continue;
		picked.push(c.name);
		if (picked.length === 2) break;
	}
	if (!picked.length) return null;
	return `${picked.map(toTitleCase).join(' with ')} (untitled scan)`;
}

function slugify(s) {
	return String(s ?? '')
		.toLowerCase()
		.replace(/\.json$/, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 80);
}

/* ── main ───────────────────────────────────────────────────────────────── */

function main() {
	const [rawDir, outPath] = process.argv.slice(2);
	if (!rawDir || !outPath) {
		console.error('usage: normalise.mjs <raw-dir> <out.json>');
		process.exit(1);
	}

	const recipes = [];
	for (const file of readdirSync(rawDir)
		.filter((f) => f.endsWith('.json'))
		.sort()) {
		const parsed = JSON.parse(readFileSync(join(rawDir, file), 'utf8'));
		for (const raw of parsed.recipes ?? [parsed]) {
			recipes.push(normaliseRecipe(raw, file));
		}
	}

	// Name the failed extractions, now that the whole corpus is available to
	// judge which of their ingredients are distinctive.
	const frequency = new Map();
	for (const r of recipes) {
		for (const i of r.ingredients) {
			const k = i.name.toLowerCase();
			frequency.set(k, (frequency.get(k) ?? 0) + 1);
		}
	}
	for (const r of recipes) {
		if (!SCANNED_NAME.test(r.name)) continue;
		const derived = nameFromIngredients(r, frequency);
		if (!derived) continue;
		r.originalName = r.name;
		r.name = derived;
		r.id = slugify(derived);
	}

	recipes.sort((a, b) => a.name.localeCompare(b.name));

	// Distinct recipes can slug to the same id; keep ids unique and stable.
	const seenIds = new Map();
	for (const r of recipes) {
		const n = (seenIds.get(r.id) ?? 0) + 1;
		seenIds.set(r.id, n);
		if (n > 1) r.id = `${r.id}-${n}`;
	}

	const pack = {
		version: 1,
		name: 'Recipe card archive',
		description: `${recipes.length} recipes extracted from scanned recipe cards.`,
		createdAt: new Date().toISOString().slice(0, 10),
		recipes
	};

	writeFileSync(outPath, JSON.stringify(pack, null, '\t') + '\n');
	report(recipes, outPath);
}

function report(recipes, outPath) {
	const ings = recipes.flatMap((r) => r.ingredients);
	const steps = recipes.flatMap((r) => r.instructions);
	const quantified = ings.filter((i) => i.amount !== null).length;
	const stepLens = recipes.map((r) => r.instructions.length);

	console.log(`wrote ${outPath}`);
	console.log(`  recipes          ${recipes.length}`);
	console.log(`  needs review     ${recipes.filter((r) => r.needsReview).length}`);
	console.log(
		`  ingredients      ${ings.length} (${quantified} quantified, ${ings.length - quantified} to taste / from a mix)`
	);
	console.log(`  distinct units   ${new Set(ings.map((i) => i.unit).filter(Boolean)).size}`);
	console.log(`  distinct tags    ${new Set(recipes.flatMap((r) => r.tags)).size}`);
	console.log(
		`  steps/recipe     min ${Math.min(...stepLens)} max ${Math.max(...stepLens)} avg ${(steps.length / recipes.length).toFixed(1)}`
	);
	console.log(`  fragment steps   ${steps.filter((s) => s.text.length < 12).length}`);
}

main();
