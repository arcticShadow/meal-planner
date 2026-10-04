import type { UnitId } from './types';

/**
 * Unit table.
 *
 * `family` decides what may be added together: 600g of chicken and 0.5kg of
 * chicken are one line, but 2 cloves of garlic and 1 tsp of garlic are not.
 * `base` converts into the family's base unit (g for mass, ml for volume).
 *
 * Count units each form their own family. A "can" of tomatoes and a "piece"
 * of tomato are not interchangeable, and guessing a conversion would put the
 * wrong number on a shopping list.
 */
interface UnitSpec {
	family: string;
	base: number;
	/** Singular and plural display labels. */
	one: string;
	many: string;
	/** Space between number and unit — "600g" but "2 cloves". */
	space: boolean;
}

export const UNITS: Record<UnitId, UnitSpec> = {
	g: { family: 'mass', base: 1, one: 'g', many: 'g', space: false },
	kg: { family: 'mass', base: 1000, one: 'kg', many: 'kg', space: false },
	ml: { family: 'volume', base: 1, one: 'ml', many: 'ml', space: false },
	l: { family: 'volume', base: 1000, one: 'L', many: 'L', space: false },
	tsp: { family: 'volume', base: 5, one: 'tsp', many: 'tsp', space: true },
	tbsp: { family: 'volume', base: 15, one: 'Tbsp', many: 'Tbsp', space: true },
	cup: { family: 'volume', base: 250, one: 'cup', many: 'cups', space: true },
	piece: { family: 'piece', base: 1, one: '', many: '', space: false },
	clove: { family: 'clove', base: 1, one: 'clove', many: 'cloves', space: true },
	can: { family: 'can', base: 1, one: 'can', many: 'cans', space: true },
	pack: { family: 'pack', base: 1, one: 'pack', many: 'packs', space: true },
	bag: { family: 'bag', base: 1, one: 'bag', many: 'bags', space: true },
	punnet: { family: 'punnet', base: 1, one: 'punnet', many: 'punnets', space: true },
	block: { family: 'block', base: 1, one: 'block', many: 'blocks', space: true },
	bunch: { family: 'bunch', base: 1, one: 'bunch', many: 'bunches', space: true },
	head: { family: 'head', base: 1, one: 'head', many: 'heads', space: true },
	sachet: { family: 'sachet', base: 1, one: 'sachet', many: 'sachets', space: true },
	sheet: { family: 'sheet', base: 1, one: 'sheet', many: 'sheets', space: true },
	handful: { family: 'handful', base: 1, one: 'handful', many: 'handfuls', space: true },
	portion: { family: 'portion', base: 1, one: 'portion', many: 'portions', space: true }
};

/** Preferred display unit per family, largest first, for picking a readable scale. */
const DISPLAY_LADDER: Record<string, UnitId[]> = {
	mass: ['kg', 'g'],
	volume: ['l', 'cup', 'tbsp', 'tsp', 'ml']
};

/** Below this, step down the ladder: 0.4kg reads worse than 400g. */
const LADDER_MIN = 1;

export function familyOf(unit: UnitId | null): string | null {
	return unit ? UNITS[unit].family : null;
}

/** Convert an amount into its family's base unit. */
export function toBase(amount: number, unit: UnitId): number {
	return amount * UNITS[unit].base;
}

/**
 * Pick the most readable unit for a base-unit amount within its family.
 * 1500 (mass) -> 1.5kg; 400 (mass) -> 400g; 500 (volume) -> 2 cups.
 */
export function fromBase(baseAmount: number, family: string): { amount: number; unit: UnitId } {
	const ladder = DISPLAY_LADDER[family];
	if (!ladder) {
		// Count families have exactly one unit, so find it and use it as-is.
		const unit = (Object.keys(UNITS) as UnitId[]).find((u) => UNITS[u].family === family)!;
		return { amount: baseAmount, unit };
	}
	for (const unit of ladder) {
		const value = baseAmount / UNITS[unit].base;
		if (value >= LADDER_MIN) return { amount: roundAmount(value), unit };
	}
	const last = ladder[ladder.length - 1];
	return { amount: roundAmount(baseAmount / UNITS[last].base), unit: last };
}

/**
 * Round for display. Shopping amounts do not need more than two decimals,
 * and whole numbers should never render as "2.00".
 */
export function roundAmount(n: number): number {
	if (!Number.isFinite(n)) return 0;
	if (Number.isInteger(n)) return n;
	// Keep common kitchen fractions legible rather than 0.33333.
	const rounded = Math.round(n * 100) / 100;
	return Math.abs(rounded) < 0.01 ? 0 : rounded;
}

const FRACTIONS: [number, string][] = [
	[0.25, '¼'],
	[1 / 3, '⅓'],
	[0.5, '½'],
	[2 / 3, '⅔'],
	[0.75, '¾']
];

/** Render a number the way a recipe would: "1½" rather than "1.5". */
export function formatAmount(n: number): string {
	const value = roundAmount(n);
	const whole = Math.floor(value);
	const frac = value - whole;

	for (const [v, glyph] of FRACTIONS) {
		if (Math.abs(frac - v) < 0.02) {
			return whole === 0 ? glyph : `${whole}${glyph}`;
		}
	}
	return String(value);
}

/** Render an amount and unit together: "600g", "2 cloves", "1½ cups", "3". */
export function formatQuantity(amount: number | null, unit: UnitId | null): string {
	if (amount === null) return '';
	const n = formatAmount(amount);
	if (!unit) return n;

	const spec = UNITS[unit];
	// English takes the singular for anything up to one: "½ cup", "1 cup",
	// "1½ cups".
	const label = roundAmount(amount) <= 1 ? spec.one : spec.many;
	if (!label) return n;
	return spec.space ? `${n} ${label}` : `${n}${label}`;
}

/**
 * Sum a set of amounts, merging only those whose units can legitimately
 * combine, and return one display total per surviving family.
 */
export function sumAmounts(
	entries: { amount: number | null; unit: UnitId | null }[]
): { amount: number; unit: UnitId }[] {
	const byFamily = new Map<string, number>();
	let bare = 0;

	for (const { amount, unit } of entries) {
		if (amount === null) continue;
		if (!unit) {
			bare += amount;
			continue;
		}
		const family = UNITS[unit].family;
		byFamily.set(family, (byFamily.get(family) ?? 0) + toBase(amount, unit));
	}

	// A bare count ("2 lemons") belongs with the piece family.
	if (bare) byFamily.set('piece', (byFamily.get('piece') ?? 0) + bare);

	return (
		[...byFamily.entries()]
			.map(([family, total]) => fromBase(total, family))
			.filter((t) => t.amount > 0)
			// Largest first, so the headline quantity leads the line.
			.sort((a, b) => b.amount * UNITS[b.unit].base - a.amount * UNITS[a.unit].base)
	);
}
