import Dexie, { type EntityTable } from 'dexie';

// UUID generation utility with fallback for older browsers
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback UUID generation for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Type definitions for our database entities
export interface Recipe {
	id?: string;
	name: string;
	description: string;
	ingredients: Ingredient[];
	instructions: string[];
	servings: number;
	defaultDuration: number; // Default number of days this meal covers
	tags: string[];
	category?: string;
	prepTime?: number; // minutes
	cookTime?: number; // minutes
	createdAt: Date;
	updatedAt: Date;
}

export interface Ingredient {
	name: string;
	quantity: number;
	unit: string;
	optional?: boolean;
}

export interface Meal {
	id?: string;
	recipeId: string;
	scheduledDate: string; // ISO date string (YYYY-MM-DD)
	duration: number; // Number of days this meal covers
	excludedIngredients: string[]; // Array of ingredient names to exclude
	ingredientSubstitutions: Record<string, Ingredient>; // Map of original ingredient name to replacement
	createdAt: Date;
}

export interface ShoppingListItem {
	id?: string;
	ingredient: string;
	quantity: number;
	unit: string;
	mealIds: string[]; // Array of meal IDs that contribute to this item
	dates: string[]; // Array of dates this ingredient is needed for
	consolidated: boolean; // Whether this item was consolidated from multiple meals
	checked?: boolean; // For shopping list UI
	createdAt: Date;
}

export interface AppSettings {
	id?: string;
	key: string;
	value: unknown;
	updatedAt: Date;
}

// Database class extending Dexie
export class MenuPlannerDB extends Dexie {
	recipes!: EntityTable<Recipe, 'id'>;
	meals!: EntityTable<Meal, 'id'>;
	shoppingListItems!: EntityTable<ShoppingListItem, 'id'>;
	settings!: EntityTable<AppSettings, 'id'>;

	constructor() {
		super('MenuPlannerDB');
		
		this.version(1).stores({
			recipes: '++id, name, category, *tags, createdAt, updatedAt',
			meals: '++id, recipeId, scheduledDate, createdAt',
			shoppingListItems: '++id, ingredient, *mealIds, *dates, consolidated, createdAt',
			settings: '++id, key, updatedAt'
		});

		// Add hooks for automatic timestamps
		this.recipes.hook('creating', function (_primKey, obj, _trans) {
			obj.id = generateUUID();
			obj.createdAt = new Date();
			obj.updatedAt = new Date();
		});

		this.recipes.hook('updating', function (modifications, _primKey, _obj, _trans) {
			(modifications as any).updatedAt = new Date();
		});

		this.meals.hook('creating', function (_primKey, obj, _trans) {
			obj.id = generateUUID();
			obj.createdAt = new Date();
		});

		this.shoppingListItems.hook('creating', function (_primKey, obj, _trans) {
			obj.id = generateUUID();
			obj.createdAt = new Date();
		});

		this.settings.hook('creating', function (_primKey, obj, _trans) {
			obj.id = generateUUID();
			obj.updatedAt = new Date();
		});

		this.settings.hook('updating', function (modifications, _primKey, _obj, _trans) {
			(modifications as any).updatedAt = new Date();
		});
	}
}

// Create database instance
export const db = new MenuPlannerDB();

// Database service functions
export class DatabaseService {
	// Recipe operations
	static async createRecipe(recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
		const id = await db.recipes.add(recipe as Recipe);
		return id as string;
	}

	static async getRecipe(id: string): Promise<Recipe | undefined> {
		return await db.recipes.get(id);
	}

	static async getAllRecipes(): Promise<Recipe[]> {
		return await db.recipes.orderBy('name').toArray();
	}

	static async updateRecipe(id: string, changes: Partial<Recipe>): Promise<void> {
		await db.recipes.update(id, changes);
	}

	static async deleteRecipe(id: string): Promise<void> {
		// Also delete associated meals
		await db.meals.where('recipeId').equals(id).delete();
		await db.recipes.delete(id);
	}

	static async searchRecipes(query: string): Promise<Recipe[]> {
		const lowerQuery = query.toLowerCase();
		return await db.recipes
			.filter(recipe => 
				recipe.name.toLowerCase().includes(lowerQuery) ||
				recipe.description.toLowerCase().includes(lowerQuery) ||
				recipe.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
			)
			.toArray();
	}

	static async getRecipesByCategory(category: string): Promise<Recipe[]> {
		return await db.recipes.where('category').equals(category).toArray();
	}

	static async getRecipesByTag(tag: string): Promise<Recipe[]> {
		return await db.recipes.where('tags').equals(tag).toArray();
	}

	// Meal operations
	static async createMeal(meal: Omit<Meal, 'id' | 'createdAt'>): Promise<string> {
		const id = await db.meals.add(meal as Meal);
		return id as string;
	}

	static async getMeal(id: string): Promise<Meal | undefined> {
		return await db.meals.get(id);
	}

	static async getMealsForDateRange(startDate: string, endDate: string): Promise<Meal[]> {
		return await db.meals
			.where('scheduledDate')
			.between(startDate, endDate, true, true)
			.toArray();
	}

	static async getMealsForDate(date: string): Promise<Meal[]> {
		return await db.meals.where('scheduledDate').equals(date).toArray();
	}

	static async updateMeal(id: string, changes: Partial<Meal>): Promise<void> {
		await db.meals.update(id, changes);
	}

	static async deleteMeal(id: string): Promise<void> {
		await db.meals.delete(id);
	}

	static async getAllMeals(): Promise<Meal[]> {
		return await db.meals.orderBy('scheduledDate').toArray();
	}

	// Shopping list operations
	static async createShoppingListItem(item: Omit<ShoppingListItem, 'id' | 'createdAt'>): Promise<string> {
		const id = await db.shoppingListItems.add(item as ShoppingListItem);
		return id as string;
	}

	static async getAllShoppingListItems(): Promise<ShoppingListItem[]> {
		return await db.shoppingListItems.orderBy('ingredient').toArray();
	}

	static async updateShoppingListItem(id: string, changes: Partial<ShoppingListItem>): Promise<void> {
		await db.shoppingListItems.update(id, changes);
	}

	static async deleteShoppingListItem(id: string): Promise<void> {
		await db.shoppingListItems.delete(id);
	}

	static async clearShoppingList(): Promise<void> {
		await db.shoppingListItems.clear();
	}

	// Settings operations
	static async getSetting(key: string): Promise<unknown> {
		const setting = await db.settings.where('key').equals(key).first();
		return setting?.value;
	}

	static async setSetting(key: string, value: unknown): Promise<void> {
		const existing = await db.settings.where('key').equals(key).first();
		if (existing) {
			await db.settings.update(existing.id!, { value });
		} else {
			await db.settings.add({ key, value, updatedAt: new Date() } as AppSettings);
		}
	}

	// Utility operations
	static async exportDatabase(): Promise<string> {
		const recipes = await db.recipes.toArray();
		const meals = await db.meals.toArray();
		const shoppingListItems = await db.shoppingListItems.toArray();
		const settings = await db.settings.toArray();

		const exportData = {
			version: 1,
			exportDate: new Date().toISOString(),
			data: {
				recipes,
				meals,
				shoppingListItems,
				settings
			}
		};

		return JSON.stringify(exportData, null, 2);
	}

	static async importDatabase(jsonData: string): Promise<void> {
		try {
			const importData = JSON.parse(jsonData);
			
			if (!importData.data) {
				throw new Error('Invalid import data format');
			}

			// Clear existing data
			await db.transaction('rw', db.recipes, db.meals, db.shoppingListItems, db.settings, async () => {
				await db.recipes.clear();
				await db.meals.clear();
				await db.shoppingListItems.clear();
				await db.settings.clear();

				// Import data
				if (importData.data.recipes) {
					await db.recipes.bulkAdd(importData.data.recipes);
				}
				if (importData.data.meals) {
					await db.meals.bulkAdd(importData.data.meals);
				}
				if (importData.data.shoppingListItems) {
					await db.shoppingListItems.bulkAdd(importData.data.shoppingListItems);
				}
				if (importData.data.settings) {
					await db.settings.bulkAdd(importData.data.settings);
				}
			});
		} catch (error) {
			throw new Error(`Failed to import database: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	static async getDatabaseStats(): Promise<{
		recipes: number;
		meals: number;
		shoppingListItems: number;
	}> {
		const [recipes, meals, shoppingListItems] = await Promise.all([
			db.recipes.count(),
			db.meals.count(),
			db.shoppingListItems.count()
		]);

		return { recipes, meals, shoppingListItems };
	}

	// Initialize database with default settings
	static async initializeDatabase(): Promise<void> {
		const isInitialized = await this.getSetting('initialized');
		
		if (!isInitialized) {
			await this.setSetting('initialized', true);
			await this.setSetting('defaultMealDuration', 2);
			await this.setSetting('weekStartsOn', 1); // Monday
			await this.setSetting('theme', 'light');
		}
	}
}

// Initialize database when module loads
DatabaseService.initializeDatabase().catch(console.error);