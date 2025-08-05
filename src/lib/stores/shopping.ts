import { writable, derived } from 'svelte/store';
import { DatabaseService, type ShoppingListItem, type Meal, type Recipe } from '../services/database.js';
import { mealStore } from './meals.js';
import { recipeStore } from './recipes.js';
import { syncStore } from './sync.js';

// Shopping list store state
interface ShoppingState {
	items: ShoppingListItem[];
	loading: boolean;
	error: string | null;
	checkedItems: Set<string>;
}

// Initial state
const initialState: ShoppingState = {
	items: [],
	loading: false,
	error: null,
	checkedItems: new Set()
};

// Create the main store
const { subscribe, update } = writable<ShoppingState>(initialState);

// Helper function to consolidate ingredients
function consolidateIngredients(meals: (Meal & { recipe: Recipe | null })[]): ShoppingListItem[] {
	const ingredientMap = new Map<string, {
		totalQuantity: number;
		unit: string;
		mealIds: string[];
		dates: string[];
		breakdown: Array<{ mealName: string; date: string; quantity: number; unit: string }>;
	}>();

	// Process each meal
	meals.forEach(meal => {
		if (!meal.recipe) return;

		meal.recipe.ingredients.forEach(ingredient => {
			// Skip excluded ingredients (case-insensitive comparison)
			const isExcluded = meal.excludedIngredients.some(excluded =>
				excluded.toLowerCase().trim() === ingredient.name.toLowerCase().trim()
			);
			if (isExcluded) {
				console.log(`Excluding ingredient: ${ingredient.name} from meal: ${meal.recipe!.name}`);
				return;
			}

			// Check for ingredient substitutions
			let finalIngredient = ingredient;
			if (meal.ingredientSubstitutions && meal.ingredientSubstitutions[ingredient.name]) {
				finalIngredient = meal.ingredientSubstitutions[ingredient.name];
				console.log(`Substituting ${ingredient.name} with ${finalIngredient.name} for meal: ${meal.recipe!.name}`);
			}

			const key = `${finalIngredient.name.toLowerCase()}-${finalIngredient.unit.toLowerCase()}`;
			
			if (ingredientMap.has(key)) {
				const existing = ingredientMap.get(key)!;
				existing.totalQuantity += finalIngredient.quantity;
				existing.mealIds.push(meal.id!);
				existing.dates.push(meal.scheduledDate);
				existing.breakdown.push({
					mealName: meal.recipe!.name,
					date: meal.scheduledDate,
					quantity: finalIngredient.quantity,
					unit: finalIngredient.unit
				});
			} else {
				ingredientMap.set(key, {
					totalQuantity: finalIngredient.quantity,
					unit: finalIngredient.unit,
					mealIds: [meal.id!],
					dates: [meal.scheduledDate],
					breakdown: [{
						mealName: meal.recipe!.name,
						date: meal.scheduledDate,
						quantity: finalIngredient.quantity,
						unit: finalIngredient.unit
					}]
				});
			}
		});
	});

	// Convert to ShoppingListItem array
	return Array.from(ingredientMap.entries()).map(([key, data]) => {
		const ingredientName = key.split('-')[0];
		return {
			id: crypto.randomUUID(),
			ingredient: ingredientName.charAt(0).toUpperCase() + ingredientName.slice(1),
			quantity: data.totalQuantity,
			unit: data.unit,
			mealIds: data.mealIds,
			dates: data.dates,
			consolidated: data.breakdown.length > 1,
			checked: false,
			createdAt: new Date()
		} as ShoppingListItem;
	}).sort((a, b) => a.ingredient.localeCompare(b.ingredient));
}

// Shopping list store actions
export const shoppingStore = {
	subscribe,

	// Load shopping list from database
	async loadShoppingList() {
		update(state => ({ ...state, loading: true, error: null }));
		
		try {
			const items = await DatabaseService.getAllShoppingListItems();
			update(state => ({ ...state, items, loading: false }));
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to load shopping list'
			}));
		}
	},

	// Generate shopping list from planned meals
	async generateShoppingList(meals: (Meal & { recipe: Recipe | null })[]) {
		update(state => ({ ...state, loading: true, error: null }));

		try {
			// Clear existing shopping list
			await DatabaseService.clearShoppingList();

			// Generate consolidated ingredients
			const consolidatedItems = consolidateIngredients(meals);

			// Save to database
			for (const item of consolidatedItems) {
				await DatabaseService.createShoppingListItem({
					ingredient: item.ingredient,
					quantity: item.quantity,
					unit: item.unit,
					mealIds: item.mealIds,
					dates: item.dates,
					consolidated: item.consolidated
				});
			}

			// Reload from database to get IDs
			await this.loadShoppingList();

			return consolidatedItems.length;
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to generate shopping list'
			}));
			throw error;
		}
	},

	// Toggle item checked status
	async toggleItemChecked(itemId: string) {
		try {
			const item = await DatabaseService.getAllShoppingListItems().then(items => 
				items.find(i => i.id === itemId)
			);
			
			if (item) {
				const newCheckedStatus = !item.checked;
				await DatabaseService.updateShoppingListItem(itemId, { checked: newCheckedStatus });
				
				update(state => ({
					...state,
					items: state.items.map(i => 
						i.id === itemId ? { ...i, checked: newCheckedStatus } : i
					),
					checkedItems: newCheckedStatus 
						? new Set([...state.checkedItems, itemId])
						: new Set([...state.checkedItems].filter(id => id !== itemId))
				}));
			}
		} catch (error) {
			update(state => ({ 
				...state, 
				error: error instanceof Error ? error.message : 'Failed to update item'
			}));
		}
	},

	// Remove item from shopping list
	async removeItem(itemId: string) {
		update(state => ({ ...state, loading: true, error: null }));

		try {
			await DatabaseService.deleteShoppingListItem(itemId);
			update(state => ({
				...state,
				items: state.items.filter(item => item.id !== itemId),
				checkedItems: new Set([...state.checkedItems].filter(id => id !== itemId)),
				loading: false
			}));
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to remove item'
			}));
		}
	},

	// Clear entire shopping list
	async clearShoppingList() {
		update(state => ({ ...state, loading: true, error: null }));

		try {
			await DatabaseService.clearShoppingList();
			update(state => ({
				...state,
				items: [],
				checkedItems: new Set(),
				loading: false
			}));

			// Broadcast to connected peers
			await syncStore.broadcastShoppingClear();
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to clear shopping list'
			}));
		}
	},

	// Export shopping list as text
	exportAsText(): string {
		let currentState: ShoppingState;
		const unsubscribe = subscribe(state => currentState = state);
		unsubscribe();

		const lines = currentState!.items.map(item => {
			const status = currentState!.checkedItems.has(item.id!) ? '✓' : '☐';
			return `${status} ${item.ingredient}: ${item.quantity}${item.unit}`;
		});

		return lines.join('\n');
	},

	// Set checked items (for UI state management)
	setCheckedItems(checkedIds: Set<string>) {
		update(state => ({ ...state, checkedItems: checkedIds }));
	},

	// Clear error
	clearError() {
		update(state => ({ ...state, error: null }));
	}
};

// Derived stores for computed values
export const shoppingListStats = derived(
	shoppingStore,
	($shoppingStore) => ({
		total: $shoppingStore.items.length,
		checked: $shoppingStore.checkedItems.size,
		remaining: $shoppingStore.items.length - $shoppingStore.checkedItems.size,
		consolidated: $shoppingStore.items.filter(item => item.consolidated).length,
		completionPercentage: $shoppingStore.items.length > 0 
			? Math.round(($shoppingStore.checkedItems.size / $shoppingStore.items.length) * 100)
			: 0
	})
);

// Get items grouped by checked status
export const itemsByStatus = derived(
	shoppingStore,
	($shoppingStore) => {
		const checked: ShoppingListItem[] = [];
		const unchecked: ShoppingListItem[] = [];

		$shoppingStore.items.forEach(item => {
			if ($shoppingStore.checkedItems.has(item.id!)) {
				checked.push(item);
			} else {
				unchecked.push(item);
			}
		});

		return { checked, unchecked };
	}
);

// Get items with detailed breakdown information
export const itemsWithBreakdown = derived(
	[shoppingStore, mealStore, recipeStore],
	([$shoppingStore, $mealStore, $recipeStore]) => {
		return $shoppingStore.items.map(item => {
			const breakdown = item.mealIds.map(mealId => {
				const meal = $mealStore.meals.find(m => m.id === mealId);
				const recipe = meal ? $recipeStore.recipes.find(r => r.id === meal.recipeId) : null;
				
				return {
					mealId,
					mealName: recipe?.name || 'Unknown Recipe',
					date: meal?.scheduledDate || 'Unknown Date',
					recipe
				};
			});

			return {
				...item,
				breakdown
			};
		});
	}
);

// Auto-generate shopping list when meals change
export const autoGenerateShoppingList = derived(
	[mealStore, recipeStore],
	([$mealStore, $recipeStore]) => {
		// Get meals with their recipes
		const mealsWithRecipes = $mealStore.meals.map(meal => {
			const recipe = $recipeStore.recipes.find(r => r.id === meal.recipeId);
			return { ...meal, recipe: recipe || null };
		}).filter(meal => meal.recipe !== null);

		return mealsWithRecipes;
	}
);

// Shopping list suggestions based on frequently used ingredients
export const ingredientSuggestions = derived(
	[shoppingStore, recipeStore],
	([$shoppingStore, $recipeStore]) => {
		const ingredientFrequency = new Map<string, number>();

		// Count ingredient usage across all recipes
		$recipeStore.recipes.forEach(recipe => {
			recipe.ingredients.forEach(ingredient => {
				const key = ingredient.name.toLowerCase();
				ingredientFrequency.set(key, (ingredientFrequency.get(key) || 0) + 1);
			});
		});

		// Get current shopping list ingredients
		const currentIngredients = new Set(
			$shoppingStore.items.map(item => item.ingredient.toLowerCase())
		);

		// Return frequently used ingredients not in current list
		return Array.from(ingredientFrequency.entries())
			.filter(([ingredient]) => !currentIngredients.has(ingredient))
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([ingredient, frequency]) => ({
				name: ingredient.charAt(0).toUpperCase() + ingredient.slice(1),
				frequency
			}));
	}
);