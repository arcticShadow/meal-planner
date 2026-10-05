import { describe, expect, it } from 'vitest';
import { decodePlan, encodePlan, planUrl } from './share';
import type { Meal, Recipe } from './types';

const recipe: Recipe = {
	id: 'curry',
	name: 'Chicken Curry',
	description: 'A rich curry.',
	category: 'Dinner',
	tags: ['quick', 'curry'],
	servings: 4,
	defaultDuration: 2,
	ingredients: [
		{ name: 'chicken breast', amount: 600, unit: 'g', prep: 'diced' },
		{ name: 'salt', amount: null, unit: null, note: 'to taste' }
	],
	instructions: [{ heading: 'Cook It', text: 'Fry the chicken.' }, { text: 'Add the sauce.' }],
	images: { thumb: 'thumb/curry.webp', hero: 'hero/curry.webp' },
	source: 'curry.json'
};

const other: Recipe = { ...recipe, id: 'unused', name: 'Not In The Plan' };

const meals: Meal[] = [
	{
		id: 'm1',
		recipeId: 'curry',
		date: '2026-03-02',
		duration: 2,
		excluded: ['salt'],
		createdAt: '2026-03-01T00:00:00Z'
	}
];

describe('share links', () => {
	it('round-trips a plan', async () => {
		const plan = await decodePlan(await encodePlan(meals, [recipe], 'Sam'));

		expect(plan.v).toBe(1);
		expect(plan.by).toBe('Sam');
		expect(plan.meals).toEqual([{ r: 'curry', d: '2026-03-02', n: 2, x: ['salt'] }]);
		expect(plan.recipes).toHaveLength(1);
		expect(plan.recipes[0].name).toBe('Chicken Curry');
		// Ingredients survive, because the point is that the recipient can shop.
		expect(plan.recipes[0].ingredients[0]).toMatchObject({ name: 'chicken breast', amount: 600 });
		expect(plan.recipes[0].instructions[0]).toMatchObject({ heading: 'Cook It' });
	});

	it('carries only the recipes the plan actually uses', async () => {
		const plan = await decodePlan(await encodePlan(meals, [recipe, other]));
		expect(plan.recipes.map((r) => r.id)).toEqual(['curry']);
	});

	it('drops images, which point at files the recipient does not have', async () => {
		const plan = await decodePlan(await encodePlan(meals, [recipe]));
		expect(plan.recipes[0].images).toEqual({});
	});

	it('puts the payload in the fragment, so it never reaches a server', async () => {
		const url = await planUrl('https://example.com/meal-planner/share', meals, [recipe]);
		const parsed = new URL(url);
		expect(parsed.search).toBe('');
		expect(parsed.hash.length).toBeGreaterThan(1);
		expect(parsed.pathname).toBe('/meal-planner/share');
	});

	it('produces a link short enough to send', async () => {
		// A fortnight of distinct meals, each carrying its whole recipe.
		const many = Array.from({ length: 10 }, (_, i) => ({ ...recipe, id: `r${i}` }));
		const manyMeals: Meal[] = many.map((r, i) => ({
			id: `m${i}`,
			recipeId: r.id,
			date: `2026-03-${String(i + 2).padStart(2, '0')}`,
			duration: 1,
			excluded: [],
			createdAt: ''
		}));

		const url = await planUrl('https://example.com/share', manyMeals, many);
		// Comfortably inside what browsers and messaging apps carry.
		expect(url.length).toBeLessThan(8000);
	});

	it('rejects a corrupt or foreign link rather than half-importing it', async () => {
		await expect(decodePlan('xnonsense')).rejects.toThrow();
		await expect(decodePlan('')).rejects.toThrow();
	});
});
