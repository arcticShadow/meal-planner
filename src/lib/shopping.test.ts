import { describe, expect, it } from 'vitest';
import { buildShoppingList, consolidationKey, mealDates } from './shopping';
import type { Meal, Recipe } from './types';

function recipe(id: string, name: string, ingredients: Recipe['ingredients']): Recipe {
	return {
		id,
		name,
		description: '',
		category: 'Dinner',
		tags: [],
		servings: 4,
		defaultDuration: 2,
		ingredients,
		instructions: [],
		images: {}
	};
}

function meal(id: string, recipeId: string, date: string, excluded: string[] = []): Meal {
	return { id, recipeId, date, duration: 2, excluded, createdAt: '2026-01-01T00:00:00Z' };
}

const EMPTY = { extras: [], checked: new Set<string>() };

describe('consolidationKey', () => {
	it('folds case, plurals and sourcing qualifiers', () => {
		expect(consolidationKey('Free Range Chicken Breast')).toBe('chicken breast');
		expect(consolidationKey('chicken breasts')).toBe('chicken breast');
		expect(consolidationKey('Organic Carrots')).toBe('carrot');
		expect(consolidationKey('TOMATOES')).toBe('tomato');
	});

	it('strips a leading measure word left over from extraction', () => {
		expect(consolidationKey('can red kidney beans')).toBe('red kidney beans');
	});

	it('leaves nouns that are already plural alone', () => {
		expect(consolidationKey('rolled oats')).toBe('rolled oats');
		expect(consolidationKey('rice noodles')).toBe('rice noodles');
	});

	it('does not merge genuinely different ingredients', () => {
		expect(consolidationKey('chicken breast')).not.toBe(consolidationKey('chicken thigh'));
		expect(consolidationKey('red onion')).not.toBe(consolidationKey('brown onion'));
	});
});

describe('mealDates', () => {
	it('covers the configured number of days from the start date', () => {
		expect(mealDates(meal('m', 'r', '2026-03-30'))).toEqual(['2026-03-30', '2026-03-31']);
	});

	it('crosses a month boundary correctly', () => {
		expect(mealDates({ ...meal('m', 'r', '2026-01-31'), duration: 2 })).toEqual([
			'2026-01-31',
			'2026-02-01'
		]);
	});
});

describe('buildShoppingList', () => {
	const curry = recipe('curry', 'Chicken Curry', [
		{ name: 'chicken breast', amount: 600, unit: 'g' },
		{ name: 'onion', amount: 1, unit: 'piece' },
		{ name: 'salt', amount: null, unit: null, note: 'to taste' }
	]);
	const burgers = recipe('burgers', 'Chicken Burgers', [
		{ name: 'Free Range Chicken Breasts', amount: 600, unit: 'g' },
		{ name: 'burger buns', amount: 4, unit: 'piece' }
	]);

	it('consolidates the same ingredient across meals and keeps the breakdown', () => {
		const list = buildShoppingList({
			meals: [meal('m1', 'curry', '2026-03-02'), meal('m2', 'burgers', '2026-03-04')],
			recipes: [curry, burgers],
			...EMPTY
		});

		const chicken = list.find((l) => l.key === 'chicken breast')!;
		expect(chicken.totals).toEqual([{ amount: 1.2, unit: 'kg' }]);
		expect(chicken.sources).toHaveLength(2);
		expect(chicken.sources.map((s) => s.recipeName).sort()).toEqual([
			'Chicken Burgers',
			'Chicken Curry'
		]);
		expect(chicken.sources.map((s) => s.date).sort()).toEqual(['2026-03-02', '2026-03-04']);
	});

	it('surfaces unquantified ingredients instead of dropping them', () => {
		const list = buildShoppingList({
			meals: [meal('m1', 'curry', '2026-03-02')],
			recipes: [curry],
			...EMPTY
		});

		const salt = list.find((l) => l.key === 'salt')!;
		expect(salt.totals).toEqual([]);
		expect(salt.unquantified).toEqual(['to taste']);
	});

	it('omits ingredients excluded on a specific meal only', () => {
		const list = buildShoppingList({
			meals: [
				meal('m1', 'curry', '2026-03-02', ['chicken breast']),
				meal('m2', 'burgers', '2026-03-04')
			],
			recipes: [curry, burgers],
			...EMPTY
		});

		// Only the burgers' 600g survives.
		const chicken = list.find((l) => l.key === 'chicken breast')!;
		expect(chicken.totals).toEqual([{ amount: 600, unit: 'g' }]);
		expect(chicken.sources).toHaveLength(1);
	});

	it('honours a date window', () => {
		const list = buildShoppingList({
			meals: [meal('m1', 'curry', '2026-03-02'), meal('m2', 'burgers', '2026-03-20')],
			recipes: [curry, burgers],
			from: '2026-03-01',
			to: '2026-03-07',
			...EMPTY
		});

		expect(list.find((l) => l.key === 'burger bun')).toBeUndefined();
		expect(list.find((l) => l.key === 'chicken breast')!.totals).toEqual([
			{ amount: 600, unit: 'g' }
		]);
	});

	it('merges hand-added extras into the same lines', () => {
		const list = buildShoppingList({
			meals: [meal('m1', 'curry', '2026-03-02')],
			recipes: [curry],
			extras: [{ id: 'e1', name: 'Onions', amount: 2, unit: 'piece', createdAt: '' }],
			checked: new Set()
		});

		const onion = list.find((l) => l.key === 'onion')!;
		expect(onion.totals).toEqual([{ amount: 3, unit: 'piece' }]);
		expect(onion.sources.some((s) => s.mealId === null)).toBe(true);
	});

	it('sorts unchecked items first so the list shortens as you shop', () => {
		const list = buildShoppingList({
			meals: [meal('m1', 'curry', '2026-03-02')],
			recipes: [curry],
			extras: [],
			checked: new Set(['chicken breast'])
		});

		expect(list[list.length - 1].key).toBe('chicken breast');
		expect(list[list.length - 1].checked).toBe(true);
	});

	it('ignores meals whose recipe has been deleted', () => {
		const list = buildShoppingList({
			meals: [meal('m1', 'gone', '2026-03-02')],
			recipes: [curry],
			...EMPTY
		});
		expect(list).toEqual([]);
	});
});
