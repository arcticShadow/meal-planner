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
	handful: 'handful',
	portion: 'portion',
	serving: 'portion',
	servings: 'portion',
	cakes: 'piece',
	large: 'piece',
	// A dice size ("diced 2cm") that leaked out of the name into the unit.
	cm: 'piece'
};

// My Food Bag lists spice-mix contents as "equal parts" of a combined sachet.
// The extractor invented a unit for each. None of them quantify anything.
const SPICE_MIX_UNITS = new Set([
	'part',
	'parts',
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
	equal: 'spice mix',
	'equal part': 'spice mix',
	'equal parts': 'spice mix'
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
	if (SPICE_MIX_UNITS.has(unitText)) return { amount: null, unit: null, note: 'spice mix' };

	return { amount, unit: UNIT_ALIASES[unitText] ?? null };
}

/* ── ingredients ────────────────────────────────────────────────────────── */

/**
 * Split "carrot, cut in half lengthways & thinly sliced" into the shopping
 * name and the prep note. Consolidation keys off the name, so leaving prep
 * attached would stop two recipes' carrots from ever merging.
 */
function splitPrep(rawName) {
	const name = String(rawName ?? '').trim();
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
			note = 'spice mix';
		} else if (VAGUE_UNITS.has(rawUnit)) {
			note = note ?? 'to taste';
		} else {
			unit = UNIT_ALIASES[rawUnit] ?? null;
		}
	}

	// A spice-mix or to-taste ingredient carries no amount, whatever was parsed.
	const unquantified = note === 'spice mix' || note === 'to taste' || note === 'to serve';
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
	const ingredients = (raw.ingredients ?? []).map(normaliseIngredient).filter((i) => i.name);
	const instructions = normaliseInstructions(raw.instructions);
	const name = String(raw.name ?? '').trim();
	const needsReview = SCANNED_NAME.test(name) || !instructions.length || !ingredients.length;

	return {
		id: slugify(name) || slugify(sourceFile),
		name,
		description: String(raw.description ?? '').trim(),
		category: String(raw.category ?? 'Dinner').trim(),
		tags: normaliseTags(raw.tags),
		servings: Number(raw.servings) || 4,
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
		name: 'My Food Bag archive',
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
		`  ingredients      ${ings.length} (${quantified} quantified, ${ings.length - quantified} to taste / spice mix)`
	);
	console.log(`  distinct units   ${new Set(ings.map((i) => i.unit).filter(Boolean)).size}`);
	console.log(`  distinct tags    ${new Set(recipes.flatMap((r) => r.tags)).size}`);
	console.log(
		`  steps/recipe     min ${Math.min(...stepLens)} max ${Math.max(...stepLens)} avg ${(steps.length / recipes.length).toFixed(1)}`
	);
	console.log(`  fragment steps   ${steps.filter((s) => s.text.length < 12).length}`);
}

main();
