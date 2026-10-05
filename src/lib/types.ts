/** Canonical unit ids. Anything outside this set is normalised away on import. */
export type UnitId =
	| 'g'
	| 'kg'
	| 'ml'
	| 'l'
	| 'tsp'
	| 'tbsp'
	| 'cup'
	| 'piece'
	| 'clove'
	| 'can'
	| 'pack'
	| 'bag'
	| 'punnet'
	| 'block'
	| 'bunch'
	| 'head'
	| 'sachet'
	| 'sheet'
	| 'handful'
	| 'portion';

/**
 * Why an ingredient carries no measurable amount. Kept as data rather than
 * folded into the quantity so the shopping list can show "salt — to taste"
 * instead of silently dropping it or inventing "1 piece".
 */
export type AmountNote = 'to taste' | 'to serve' | 'from a mix' | 'remaining';

export interface Ingredient {
	name: string;
	/** null when the recipe gives no measurable amount; see `note`. */
	amount: number | null;
	unit: UnitId | null;
	/** Preparation split off the name ("thinly sliced") so names consolidate. */
	prep?: string;
	/** True when `amount` came from a range and is the upper bound. */
	approx?: boolean;
	note?: AmountNote;
	optional?: boolean;
}

export interface Step {
	/** Phase banner from the recipe card ("Prep It"), on the first step only. */
	heading?: string;
	text: string;
}

/**
 * Paths to the recipe's pictures, relative to the pack's image directory.
 * All optional: a hand-written recipe has none, and an imported pack may
 * ship without them.
 */
export interface RecipeImages {
	/** 400px wide, for the library grid. */
	thumb?: string;
	/** 1000px wide, for the recipe header. */
	hero?: string;
	/** 1500px scan of the printed card, for checking against the original. */
	card?: string;
}

export interface Recipe {
	id: string;
	name: string;
	description: string;
	category: string;
	tags: string[];
	servings: number;
	/** How many days of meals this recipe covers by default. */
	defaultDuration: number;
	ingredients: Ingredient[];
	instructions: Step[];
	images: RecipeImages;
	/** Set by the importer when extraction was incomplete. */
	needsReview?: boolean;
	/** Original title when the name had to be derived. */
	originalName?: string;
	source?: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface Meal {
	id: string;
	recipeId: string;
	/** ISO date, YYYY-MM-DD. The first day this meal covers. */
	date: string;
	/** Days covered, defaulting to the recipe's defaultDuration. */
	duration: number;
	/** Ingredient names the cook already has and does not want to buy. */
	excluded: string[];
	createdAt: string;
}

/** A manually added shopping entry, not derived from any meal. */
export interface ExtraItem {
	id: string;
	name: string;
	amount: number | null;
	unit: UnitId | null;
	createdAt: string;
}

/**
 * One line of the shopping list: every contribution to a single ingredient,
 * already summed where the units allow it.
 */
export interface ShoppingLine {
	/** Consolidation key — the lowercased ingredient name. */
	key: string;
	name: string;
	/** Summed amounts, one per unit family that could not merge with another. */
	totals: { amount: number; unit: UnitId }[];
	/** Contributions with no measurable amount, e.g. "to taste". */
	unquantified: AmountNote[];
	sources: ShoppingSource[];
	checked: boolean;
}

export interface ShoppingSource {
	mealId: string | null;
	recipeName: string;
	date: string | null;
	amount: number | null;
	unit: UnitId | null;
	note?: AmountNote;
	prep?: string;
}

/** An importable bundle of recipes. */
export interface RecipePack {
	version: number;
	name: string;
	description?: string;
	createdAt?: string;
	recipes: Recipe[];
}

/** Everything the app owns, for backup and restore. */
export interface Backup {
	version: number;
	exportedAt: string;
	recipes: Recipe[];
	meals: Meal[];
	extras: ExtraItem[];
	checked: string[];
}
