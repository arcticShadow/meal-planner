import type { ExtraItem, Meal, Recipe, ShoppingLine, ShoppingSource } from './types';
import { addDays } from './dates';
import { sumAmounts } from './units';

/**
 * Normalise an ingredient name into a consolidation key.
 *
 * Two recipes rarely spell an ingredient identically ("Free Range Chicken
 * Breast" vs "free range chicken breasts"), and a shopping list that lists
 * them separately defeats the point. This folds case, plurals and a few
 * qualifiers that never change what you buy.
 *
 * Deliberately conservative: it will under-merge rather than combine two
 * genuinely different things, because a split line is a mild annoyance and a
 * wrongly merged one sends you home without an ingredient.
 */
export function consolidationKey(name: string): string {
	let k = name.toLowerCase().trim();

	// Qualifiers that describe sourcing or grade, not the item itself.
	k = k.replace(/\b(free range|organic|fresh|frozen|premium|large|small|baby)\b/g, ' ');
	// Leading measure words left over from extraction ("can red kidney beans").
	k = k.replace(/^(can|tin|pack|packet|bag|punnet|block|bunch|head)\s+(of\s+)?/, '');
	k = k
		.replace(/[^a-z0-9 ]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	// Singularise the last word only; "oats" and "greens" are already plural
	// nouns that should stay whole.
	const words = k.split(' ');
	const last = words[words.length - 1];
	if (last && last.length > 3 && !IRREGULAR_PLURALS.has(last)) {
		if (last.endsWith('ies')) words[words.length - 1] = last.slice(0, -3) + 'y';
		else if (last.endsWith('oes')) words[words.length - 1] = last.slice(0, -2);
		else if (last.endsWith('s') && !last.endsWith('ss'))
			words[words.length - 1] = last.slice(0, -1);
	}
	return words.join(' ').trim() || name.toLowerCase().trim();
}

const IRREGULAR_PLURALS = new Set([
	'oats',
	'greens',
	'peas',
	'chips',
	'crisps',
	'noodles',
	'beans',
	'lentils',
	'sprouts',
	'herbs',
	'grains',
	'oils',
	'spices'
]);

/** Inclusive list of ISO dates a meal covers, starting at its date. */
export function mealDates(meal: Meal): string[] {
	const dates: string[] = [];
	for (let i = 0; i < Math.max(1, meal.duration); i++) {
		dates.push(addDays(meal.date, i));
	}
	return dates;
}

export interface BuildOptions {
	meals: Meal[];
	recipes: Recipe[];
	extras: ExtraItem[];
	checked: Set<string>;
	/** Only include meals on or after this ISO date. */
	from?: string;
	/** Only include meals on or before this ISO date. */
	to?: string;
}

/**
 * Build the consolidated shopping list.
 *
 * Every contribution is kept in `sources` so a line can be expanded to show
 * which meal and which day each part came from — 1.2kg of chicken is only
 * useful if you can see it is 600g for Monday's curry and 600g for
 * Wednesday's burgers.
 */
export function buildShoppingList({
	meals,
	recipes,
	extras,
	checked,
	from,
	to
}: BuildOptions): ShoppingLine[] {
	const byId = new Map(recipes.map((r) => [r.id, r]));
	const lines = new Map<string, ShoppingLine>();

	const lineFor = (key: string, name: string): ShoppingLine => {
		let line = lines.get(key);
		if (!line) {
			line = { key, name, totals: [], unquantified: [], sources: [], checked: checked.has(key) };
			lines.set(key, line);
		}
		// Prefer the shortest spelling seen; it is usually the plainest.
		if (name.length < line.name.length) line.name = name;
		return line;
	};

	for (const meal of meals) {
		if (from && meal.date < from) continue;
		if (to && meal.date > to) continue;

		const recipe = byId.get(meal.recipeId);
		if (!recipe) continue;

		const excluded = new Set(meal.excluded.map((n) => n.toLowerCase()));

		for (const ing of recipe.ingredients) {
			if (excluded.has(ing.name.toLowerCase())) continue;

			const key = consolidationKey(ing.name);
			const line = lineFor(key, ing.name);
			const source: ShoppingSource = {
				mealId: meal.id,
				recipeName: recipe.name,
				date: meal.date,
				amount: ing.amount,
				unit: ing.unit
			};
			if (ing.note) source.note = ing.note;
			if (ing.prep) source.prep = ing.prep;
			line.sources.push(source);

			if (ing.amount === null && ing.note && !line.unquantified.includes(ing.note)) {
				line.unquantified.push(ing.note);
			}
		}
	}

	for (const extra of extras) {
		const key = consolidationKey(extra.name);
		const line = lineFor(key, extra.name);
		line.sources.push({
			mealId: null,
			recipeName: 'Added by hand',
			date: null,
			amount: extra.amount,
			unit: extra.unit
		});
	}

	for (const line of lines.values()) {
		line.totals = sumAmounts(line.sources);
	}

	return [...lines.values()].sort((a, b) => {
		// Unchecked first so the list shortens as you shop.
		if (a.checked !== b.checked) return a.checked ? 1 : -1;
		return a.name.localeCompare(b.name);
	});
}
