import { writable, derived } from 'svelte/store';
import { DatabaseService, type Recipe } from '../services/database.js';
import { validateRecipe, sanitizeRecipe } from '../utils/validators.js';
import { syncStore } from './sync.js';

// Recipe store state
interface RecipeState {
	recipes: Recipe[];
	loading: boolean;
	error: string | null;
	searchQuery: string;
	selectedCategory: string;
	selectedTags: string[];
}

// Initial state
const initialState: RecipeState = {
	recipes: [],
	loading: false,
	error: null,
	searchQuery: '',
	selectedCategory: '',
	selectedTags: []
};

// Create the main store
const { subscribe, update } = writable<RecipeState>(initialState);

// Recipe store actions
export const recipeStore = {
	subscribe,

	// Load all recipes from database
	async loadRecipes() {
		update(state => ({ ...state, loading: true, error: null }));
		
		try {
			const recipes = await DatabaseService.getAllRecipes();
			update(state => ({ ...state, recipes, loading: false }));
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to load recipes'
			}));
		}
	},

	// Add a new recipe
	async addRecipe(recipeData: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>) {
		update(state => ({ ...state, loading: true, error: null }));

		try {
			// Validate and sanitize the recipe
			const sanitized = sanitizeRecipe(recipeData);
			const validation = validateRecipe(sanitized);
			
			if (!validation.isValid) {
				const errorMessage = validation.errors.map(e => e.message).join(', ');
				throw new Error(`Validation failed: ${errorMessage}`);
			}

			// Add to database
			const id = await DatabaseService.createRecipe(sanitized as Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>);
			const newRecipe = await DatabaseService.getRecipe(id);
			
			if (newRecipe) {
				update(state => ({
					...state,
					recipes: [...state.recipes, newRecipe].sort((a, b) => a.name.localeCompare(b.name)),
					loading: false
				}));

				// Broadcast to connected peers
				await syncStore.broadcastRecipeCreate(newRecipe);
			}

			return id;
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to add recipe'
			}));
			throw error;
		}
	},

	// Update an existing recipe
	async updateRecipe(id: string, changes: Partial<Recipe>) {
		update(state => ({ ...state, loading: true, error: null }));

		try {
			// Get current recipe for validation
			const currentRecipe = await DatabaseService.getRecipe(id);
			if (!currentRecipe) {
				throw new Error('Recipe not found');
			}

			// Merge changes and validate
			const updatedRecipe = { ...currentRecipe, ...changes };
			const sanitized = sanitizeRecipe(updatedRecipe);
			const validation = validateRecipe(sanitized);
			
			if (!validation.isValid) {
				const errorMessage = validation.errors.map(e => e.message).join(', ');
				throw new Error(`Validation failed: ${errorMessage}`);
			}

			// Update in database
			await DatabaseService.updateRecipe(id, sanitized);
			const updated = await DatabaseService.getRecipe(id);
			
			if (updated) {
				update(state => ({
					...state,
					recipes: state.recipes.map(recipe =>
						recipe.id === id ? updated : recipe
					).sort((a, b) => a.name.localeCompare(b.name)),
					loading: false
				}));

				// Broadcast to connected peers
				await syncStore.broadcastRecipeUpdate(updated);
			}
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to update recipe'
			}));
			throw error;
		}
	},

	// Delete a recipe
	async deleteRecipe(id: string) {
		update(state => ({ ...state, loading: true, error: null }));

		try {
			// Get recipe before deletion for sync broadcast
			const recipeToDelete = await DatabaseService.getRecipe(id);
			
			await DatabaseService.deleteRecipe(id);
			update(state => ({
				...state,
				recipes: state.recipes.filter(recipe => recipe.id !== id),
				loading: false
			}));

			// Broadcast to connected peers
			if (recipeToDelete) {
				await syncStore.broadcastRecipeDelete(recipeToDelete);
			}
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to delete recipe'
			}));
			throw error;
		}
	},

	// Import recipes from JSON
	async importRecipes(jsonData: string) {
		update(state => ({ ...state, loading: true, error: null }));

		try {
			const data = JSON.parse(jsonData);
			
			if (!data.recipes || !Array.isArray(data.recipes)) {
				throw new Error('Invalid import format: expected "recipes" array');
			}

			let importedCount = 0;
			const errors: string[] = [];

			for (const recipeData of data.recipes) {
				try {
					const sanitized = sanitizeRecipe(recipeData);
					const validation = validateRecipe(sanitized);
					
					if (!validation.isValid) {
						errors.push(`Recipe "${recipeData.name || 'Unknown'}": ${validation.errors.map(e => e.message).join(', ')}`);
						continue;
					}

					await DatabaseService.createRecipe(sanitized as Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>);
					importedCount++;
				} catch (error) {
					errors.push(`Recipe "${recipeData.name || 'Unknown'}": ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			}

			// Reload recipes to get the updated list
			await this.loadRecipes();

			if (errors.length > 0) {
				const errorMessage = `Imported ${importedCount} recipes with ${errors.length} errors:\n${errors.join('\n')}`;
				update(state => ({ ...state, error: errorMessage }));
			}

			return { imported: importedCount, errors: errors.length };
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to import recipes'
			}));
			throw error;
		}
	},

	// Search and filter actions
	setSearchQuery(query: string) {
		update(state => ({ ...state, searchQuery: query }));
	},

	setSelectedCategory(category: string) {
		update(state => ({ ...state, selectedCategory: category }));
	},

	setSelectedTags(tags: string[]) {
		update(state => ({ ...state, selectedTags: tags }));
	},

	// Clear filters
	clearFilters() {
		update(state => ({ 
			...state, 
			searchQuery: '', 
			selectedCategory: '', 
			selectedTags: [] 
		}));
	},

	// Clear error
	clearError() {
		update(state => ({ ...state, error: null }));
	}
};

// Derived stores for computed values
export const filteredRecipes = derived(
	recipeStore,
	($recipeStore) => {
		let filtered = $recipeStore.recipes;

		// Apply search query
		if ($recipeStore.searchQuery.trim()) {
			const query = $recipeStore.searchQuery.toLowerCase().trim();
			filtered = filtered.filter(recipe =>
				recipe.name.toLowerCase().includes(query) ||
				recipe.description.toLowerCase().includes(query) ||
				recipe.tags.some(tag => tag.toLowerCase().includes(query)) ||
				recipe.ingredients.some(ingredient => ingredient.name.toLowerCase().includes(query))
			);
		}

		// Apply category filter
		if ($recipeStore.selectedCategory) {
			filtered = filtered.filter(recipe => recipe.category === $recipeStore.selectedCategory);
		}

		// Apply tag filters
		if ($recipeStore.selectedTags.length > 0) {
			filtered = filtered.filter(recipe =>
				$recipeStore.selectedTags.every(tag => recipe.tags.includes(tag))
			);
		}

		return filtered;
	}
);

// Get all unique categories
export const recipeCategories = derived(
	recipeStore,
	($recipeStore) => {
		const categories = new Set<string>();
		$recipeStore.recipes.forEach(recipe => {
			if (recipe.category) {
				categories.add(recipe.category);
			}
		});
		return Array.from(categories).sort();
	}
);

// Get all unique tags
export const recipeTags = derived(
	recipeStore,
	($recipeStore) => {
		const tags = new Set<string>();
		$recipeStore.recipes.forEach(recipe => {
			recipe.tags.forEach(tag => tags.add(tag));
		});
		return Array.from(tags).sort();
	}
);

// Recipe statistics
export const recipeStats = derived(
	recipeStore,
	($recipeStore) => ({
		total: $recipeStore.recipes.length,
		categories: new Set($recipeStore.recipes.map(r => r.category).filter(Boolean)).size,
		tags: new Set($recipeStore.recipes.flatMap(r => r.tags)).size,
		averageIngredients: $recipeStore.recipes.length > 0 
			? Math.round($recipeStore.recipes.reduce((sum, r) => sum + r.ingredients.length, 0) / $recipeStore.recipes.length)
			: 0
	})
);