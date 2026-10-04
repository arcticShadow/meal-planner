import Dexie, { type EntityTable } from 'dexie';
import type { ExtraItem, Meal, Recipe } from './types';

/** A ticked-off shopping line. Keyed by the consolidation key, not a meal. */
interface CheckedLine {
	key: string;
	checkedAt: string;
}

interface Setting {
	key: string;
	value: unknown;
}

export class MealPlannerDB extends Dexie {
	recipes!: EntityTable<Recipe, 'id'>;
	meals!: EntityTable<Meal, 'id'>;
	extras!: EntityTable<ExtraItem, 'id'>;
	checked!: EntityTable<CheckedLine, 'key'>;
	settings!: EntityTable<Setting, 'key'>;

	constructor() {
		super('meal-planner');

		// v1 was the pre-overhaul schema (quantity-as-number ingredients and a
		// sync table). Nothing shipped on it worth migrating, so v2 starts clean
		// under a new database name.
		this.version(1).stores({
			recipes: 'id, name, category, *tags',
			meals: 'id, date, recipeId',
			extras: 'id, name',
			checked: 'key',
			settings: 'key'
		});
	}
}

export const db = new MealPlannerDB();

export function newId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
	return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
