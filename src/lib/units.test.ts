import { describe, expect, it } from 'vitest';
import { formatQuantity, fromBase, sumAmounts } from './units';

describe('sumAmounts', () => {
	it('adds amounts within a family and converts to a readable unit', () => {
		// The headline case: 600g on Monday plus 600g on Wednesday is 1.2kg.
		expect(sumAmounts([{ amount: 600, unit: 'g' }, { amount: 600, unit: 'g' }])).toEqual([
			{ amount: 1.2, unit: 'kg' }
		]);
	});

	it('converts across units of the same family before adding', () => {
		expect(sumAmounts([{ amount: 500, unit: 'g' }, { amount: 1, unit: 'kg' }])).toEqual([
			{ amount: 1.5, unit: 'kg' }
		]);
		// 2 Tbsp (30ml) + 2 tsp (10ml) = 40ml, shown in the largest unit that
		// leaves a value of at least one.
		expect(sumAmounts([{ amount: 2, unit: 'tbsp' }, { amount: 2, unit: 'tsp' }])).toEqual([
			{ amount: 2.67, unit: 'tbsp' }
		]);
	});

	it('keeps amounts from different families apart', () => {
		// Guessing how many grams are in a clove would put a wrong number on
		// the list, so these stay as two totals on one line.
		const totals = sumAmounts([
			{ amount: 2, unit: 'clove' },
			{ amount: 10, unit: 'g' }
		]);
		expect(totals).toHaveLength(2);
		expect(totals).toEqual(expect.arrayContaining([
			{ amount: 2, unit: 'clove' },
			{ amount: 10, unit: 'g' }
		]));
	});

	it('treats a bare count as pieces', () => {
		expect(sumAmounts([{ amount: 2, unit: null }, { amount: 1, unit: 'piece' }])).toEqual([
			{ amount: 3, unit: 'piece' }
		]);
	});

	it('ignores contributions with no amount', () => {
		expect(sumAmounts([{ amount: null, unit: null }, { amount: 5, unit: 'g' }])).toEqual([
			{ amount: 5, unit: 'g' }
		]);
		expect(sumAmounts([{ amount: null, unit: null }])).toEqual([]);
	});

	it('steps down the ladder rather than showing a fraction of a large unit', () => {
		expect(sumAmounts([{ amount: 400, unit: 'g' }])).toEqual([{ amount: 400, unit: 'g' }]);
	});
});

describe('fromBase', () => {
	it('picks the largest unit that leaves a value of at least one', () => {
		expect(fromBase(1500, 'mass')).toEqual({ amount: 1.5, unit: 'kg' });
		expect(fromBase(250, 'volume')).toEqual({ amount: 1, unit: 'cup' });
		expect(fromBase(15, 'volume')).toEqual({ amount: 1, unit: 'tbsp' });
		expect(fromBase(2, 'volume')).toEqual({ amount: 2, unit: 'ml' });
	});
});

describe('formatQuantity', () => {
	it('uses kitchen fractions instead of decimals', () => {
		expect(formatQuantity(0.5, 'cup')).toBe('½ cup');
		expect(formatQuantity(1.5, 'cup')).toBe('1½ cups');
		expect(formatQuantity(0.25, 'tsp')).toBe('¼ tsp');
	});

	it('pluralises and spaces per unit', () => {
		expect(formatQuantity(600, 'g')).toBe('600g');
		expect(formatQuantity(1, 'clove')).toBe('1 clove');
		expect(formatQuantity(2, 'clove')).toBe('2 cloves');
	});

	it('renders a bare count with no unit label', () => {
		expect(formatQuantity(3, 'piece')).toBe('3');
		expect(formatQuantity(2, null)).toBe('2');
	});

	it('renders nothing when there is no amount', () => {
		expect(formatQuantity(null, 'g')).toBe('');
	});
});
