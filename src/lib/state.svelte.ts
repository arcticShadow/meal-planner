import { browser } from '$app/environment';
import { SvelteSet } from 'svelte/reactivity';
import { db, newId } from './db';
import { addDays, today } from './dates';
import { buildShoppingList, consolidationKey } from './shopping';
import type { Backup, ExtraItem, Meal, Recipe, RecipePack, ShoppingLine, UnitId } from './types';

/**
 * The whole application state.
 *
 * Everything lives in memory and is mirrored to IndexedDB on write. The data
 * set is small — a few hundred recipes and a few dozen meals — so keeping it
 * all resident avoids a query layer and lets the shopping list recompute
 * synchronously whenever a meal changes.
 */
class AppState {
	recipes = $state<Recipe[]>([]);
	meals = $state<Meal[]>([]);
	extras = $state<ExtraItem[]>([]);
	/**
	 * Ticked-off shopping lines. A SvelteSet rather than a plain Set so that
	 * mutating it is reactive — which means this field is never reassigned,
	 * only emptied and refilled.
	 */
	readonly checked = new SvelteSet<string>();
	ready = $state(false);

	/** Shopping list window, as ISO dates. */
	from = $state(today());
	to = $state(addDays(today(), 13));

	async load() {
		if (!browser || this.ready) return;
		const [recipes, meals, extras, checked] = await Promise.all([
			db.recipes.toArray(),
			db.meals.toArray(),
			db.extras.toArray(),
			db.checked.toArray()
		]);
		this.recipes = recipes;
		this.meals = meals;
		this.extras = extras;
		for (const c of checked) this.checked.add(c.key);
		this.ready = true;
	}

	recipe(id: string): Recipe | undefined {
		return this.recipes.find((r) => r.id === id);
	}

	/** Meals on a given day, including those a multi-day meal carries over to. */
	mealsOn(date: string): Meal[] {
		return this.meals.filter((m) => {
			const end = addDays(m.date, Math.max(1, m.duration) - 1);
			return m.date <= date && date <= end;
		});
	}

	get shoppingList(): ShoppingLine[] {
		return buildShoppingList({
			meals: this.meals,
			recipes: this.recipes,
			extras: this.extras,
			checked: this.checked,
			from: this.from,
			to: this.to
		});
	}

	get outstandingCount(): number {
		return this.shoppingList.filter((l) => !l.checked).length;
	}

	/* ── recipes ───────────────────────────────────────────────────────── */

	async addRecipe(recipe: Omit<Recipe, 'id'> & { id?: string }): Promise<Recipe> {
		const full: Recipe = {
			...recipe,
			id: recipe.id ?? newId(),
			createdAt: recipe.createdAt ?? new Date().toISOString()
		};
		await db.recipes.put($state.snapshot(full));
		this.recipes = [...this.recipes, full];
		return full;
	}

	async updateRecipe(id: string, patch: Partial<Recipe>) {
		const next = this.recipes.map((r) =>
			r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r
		);
		this.recipes = next;
		const updated = next.find((r) => r.id === id);
		if (updated) await db.recipes.put($state.snapshot(updated));
	}

	async deleteRecipe(id: string) {
		// Meals pointing at a deleted recipe would render as blanks, so they go too.
		const orphaned = this.meals.filter((m) => m.recipeId === id).map((m) => m.id);
		this.recipes = this.recipes.filter((r) => r.id !== id);
		this.meals = this.meals.filter((m) => m.recipeId !== id);
		await Promise.all([db.recipes.delete(id), db.meals.bulkDelete(orphaned)]);
	}

	/**
	 * Import a pack. Recipes already present by id are left alone so a repeat
	 * import cannot duplicate the library or clobber edits.
	 */
	async importPack(pack: RecipePack): Promise<{ added: number; skipped: number }> {
		const existing = new Set(this.recipes.map((r) => r.id));
		const incoming = pack.recipes.filter((r) => !existing.has(r.id));
		if (incoming.length) {
			await db.recipes.bulkPut(incoming);
			this.recipes = [...this.recipes, ...incoming];
		}
		return { added: incoming.length, skipped: pack.recipes.length - incoming.length };
	}

	/* ── plan ──────────────────────────────────────────────────────────── */

	async addMeal(recipeId: string, date: string, duration?: number): Promise<Meal> {
		const recipe = this.recipe(recipeId);
		const meal: Meal = {
			id: newId(),
			recipeId,
			date,
			duration: duration ?? recipe?.defaultDuration ?? 2,
			excluded: [],
			createdAt: new Date().toISOString()
		};
		await db.meals.put(meal);
		this.meals = [...this.meals, meal];
		return meal;
	}

	async updateMeal(id: string, patch: Partial<Meal>) {
		const next = this.meals.map((m) => (m.id === id ? { ...m, ...patch } : m));
		this.meals = next;
		const updated = next.find((m) => m.id === id);
		if (updated) await db.meals.put($state.snapshot(updated));
	}

	async removeMeal(id: string) {
		this.meals = this.meals.filter((m) => m.id !== id);
		await db.meals.delete(id);
	}

	/** Toggle whether a meal contributes one of its ingredients to the list. */
	async toggleIngredient(mealId: string, ingredientName: string) {
		const meal = this.meals.find((m) => m.id === mealId);
		if (!meal) return;
		const excluded = meal.excluded.includes(ingredientName)
			? meal.excluded.filter((n) => n !== ingredientName)
			: [...meal.excluded, ingredientName];
		await this.updateMeal(mealId, { excluded });
	}

	/**
	 * The soonest day with nothing planned, which is what someone adding a
	 * meal almost always wants.
	 */
	nextFreeDate(): string {
		let date = today();
		for (let i = 0; i < 60; i++) {
			if (!this.mealsOn(date).length) return date;
			date = addDays(date, 1);
		}
		return today();
	}

	/* ── shopping ──────────────────────────────────────────────────────── */

	async toggleChecked(key: string) {
		if (this.checked.has(key)) {
			this.checked.delete(key);
			await db.checked.delete(key);
		} else {
			this.checked.add(key);
			await db.checked.put({ key, checkedAt: new Date().toISOString() });
		}
	}

	async clearChecked() {
		const keys = [...this.checked];
		this.checked.clear();
		await db.checked.bulkDelete(keys);
	}

	async addExtra(name: string, amount: number | null, unit: UnitId | null) {
		const extra: ExtraItem = {
			id: newId(),
			name: name.trim(),
			amount,
			unit,
			createdAt: new Date().toISOString()
		};
		await db.extras.put(extra);
		this.extras = [...this.extras, extra];
	}

	/** Remove the hand-added entries behind a line. Meal-derived parts stay. */
	async removeExtrasFor(key: string) {
		const doomed = this.extras.filter((e) => consolidationKey(e.name) === key);
		this.extras = this.extras.filter((e) => !doomed.includes(e));
		await db.extras.bulkDelete(doomed.map((e) => e.id));
	}

	/* ── backup ────────────────────────────────────────────────────────── */

	backup(): Backup {
		return {
			version: 1,
			exportedAt: new Date().toISOString(),
			recipes: $state.snapshot(this.recipes) as Recipe[],
			meals: $state.snapshot(this.meals) as Meal[],
			extras: $state.snapshot(this.extras) as ExtraItem[],
			checked: [...this.checked]
		};
	}

	/** Replace everything. Used by restore, which is explicitly destructive. */
	async restore(backup: Backup) {
		await db.transaction('rw', db.recipes, db.meals, db.extras, db.checked, async () => {
			await Promise.all([
				db.recipes.clear(),
				db.meals.clear(),
				db.extras.clear(),
				db.checked.clear()
			]);
			await db.recipes.bulkPut(backup.recipes ?? []);
			await db.meals.bulkPut(backup.meals ?? []);
			await db.extras.bulkPut(backup.extras ?? []);
			await db.checked.bulkPut((backup.checked ?? []).map((key) => ({ key, checkedAt: '' })));
		});
		this.recipes = backup.recipes ?? [];
		this.meals = backup.meals ?? [];
		this.extras = backup.extras ?? [];
		this.checked.clear();
		for (const key of backup.checked ?? []) this.checked.add(key);
	}

	async eraseAll() {
		await db.transaction('rw', db.recipes, db.meals, db.extras, db.checked, async () => {
			await Promise.all([
				db.recipes.clear(),
				db.meals.clear(),
				db.extras.clear(),
				db.checked.clear()
			]);
		});
		this.recipes = [];
		this.meals = [];
		this.extras = [];
		this.checked.clear();
	}
}

export const app = new AppState();
