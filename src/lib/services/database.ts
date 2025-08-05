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

// Create database instance (browser only)
export const db = typeof window !== 'undefined' ? new MenuPlannerDB() : null;

// Database service functions
export class DatabaseService {
	// Helper to check if database is available
	private static ensureDB() {
		if (!db) {
			throw new Error('Database not available (SSR)');
		}
		return db;
	}

	// Recipe operations
	static async createRecipe(recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
		const database = this.ensureDB();
		const id = await database.recipes.add(recipe as Recipe);
		return id as string;
	}

	static async getRecipe(id: string): Promise<Recipe | undefined> {
		const database = this.ensureDB();
		return await database.recipes.get(id);
	}

	static async getAllRecipes(): Promise<Recipe[]> {
		const database = this.ensureDB();
		return await database.recipes.orderBy('name').toArray();
	}

	static async updateRecipe(id: string, changes: Partial<Recipe>): Promise<void> {
		const database = this.ensureDB();
		await database.recipes.update(id, changes);
	}

	static async deleteRecipe(id: string): Promise<void> {
		const database = this.ensureDB();
		// Also delete associated meals
		await database.meals.where('recipeId').equals(id).delete();
		await database.recipes.delete(id);
	}

	static async searchRecipes(query: string): Promise<Recipe[]> {
		const database = this.ensureDB();
		const lowerQuery = query.toLowerCase();
		return await database.recipes
			.filter(recipe =>
				recipe.name.toLowerCase().includes(lowerQuery) ||
				recipe.description.toLowerCase().includes(lowerQuery) ||
				recipe.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
			)
			.toArray();
	}

	static async getRecipesByCategory(category: string): Promise<Recipe[]> {
		const database = this.ensureDB();
		return await database.recipes.where('category').equals(category).toArray();
	}

	static async getRecipesByTag(tag: string): Promise<Recipe[]> {
		const database = this.ensureDB();
		return await database.recipes.where('tags').equals(tag).toArray();
	}

	// Meal operations
	static async createMeal(meal: Omit<Meal, 'id' | 'createdAt'>): Promise<string> {
		const database = this.ensureDB();
		const id = await database.meals.add(meal as Meal);
		return id as string;
	}

	static async getMeal(id: string): Promise<Meal | undefined> {
		const database = this.ensureDB();
		return await database.meals.get(id);
	}

	static async getMealsForDateRange(startDate: string, endDate: string): Promise<Meal[]> {
		const database = this.ensureDB();
		return await database.meals
			.where('scheduledDate')
			.between(startDate, endDate, true, true)
			.toArray();
	}

	static async getMealsForDate(date: string): Promise<Meal[]> {
		const database = this.ensureDB();
		return await database.meals.where('scheduledDate').equals(date).toArray();
	}

	static async updateMeal(id: string, changes: Partial<Meal>): Promise<void> {
		const database = this.ensureDB();
		await database.meals.update(id, changes);
	}

	static async deleteMeal(id: string): Promise<void> {
		const database = this.ensureDB();
		await database.meals.delete(id);
	}

	static async getAllMeals(): Promise<Meal[]> {
		const database = this.ensureDB();
		return await database.meals.orderBy('scheduledDate').toArray();
	}

	// Shopping list operations
	static async createShoppingListItem(item: Omit<ShoppingListItem, 'id' | 'createdAt'>): Promise<string> {
		const database = this.ensureDB();
		const id = await database.shoppingListItems.add(item as ShoppingListItem);
		return id as string;
	}

	static async getAllShoppingListItems(): Promise<ShoppingListItem[]> {
		const database = this.ensureDB();
		return await database.shoppingListItems.orderBy('ingredient').toArray();
	}

	static async updateShoppingListItem(id: string, changes: Partial<ShoppingListItem>): Promise<void> {
		const database = this.ensureDB();
		await database.shoppingListItems.update(id, changes);
	}

	static async deleteShoppingListItem(id: string): Promise<void> {
		const database = this.ensureDB();
		await database.shoppingListItems.delete(id);
	}

	static async clearShoppingList(): Promise<void> {
		const database = this.ensureDB();
		await database.shoppingListItems.clear();
	}

	// Settings operations
	static async getSetting(key: string): Promise<unknown> {
		const database = this.ensureDB();
		const setting = await database.settings.where('key').equals(key).first();
		return setting?.value;
	}

	static async setSetting(key: string, value: unknown): Promise<void> {
		const database = this.ensureDB();
		const existing = await database.settings.where('key').equals(key).first();
		if (existing) {
			await database.settings.update(existing.id!, { value });
		} else {
			await database.settings.add({ key, value, updatedAt: new Date() } as AppSettings);
		}
	}

	// Utility operations
	static async exportDatabase(): Promise<string> {
		const database = this.ensureDB();
		const recipes = await database.recipes.toArray();
		const meals = await database.meals.toArray();
		const shoppingListItems = await database.shoppingListItems.toArray();
		const settings = await database.settings.toArray();

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
			const database = this.ensureDB();
			const importData = JSON.parse(jsonData);
			
			if (!importData.data) {
				throw new Error('Invalid import data format');
			}

			// Clear existing data
			await database.transaction('rw', database.recipes, database.meals, database.shoppingListItems, database.settings, async () => {
				await database.recipes.clear();
				await database.meals.clear();
				await database.shoppingListItems.clear();
				await database.settings.clear();

				// Import data
				if (importData.data.recipes) {
					await database.recipes.bulkAdd(importData.data.recipes);
				}
				if (importData.data.meals) {
					await database.meals.bulkAdd(importData.data.meals);
				}
				if (importData.data.shoppingListItems) {
					await database.shoppingListItems.bulkAdd(importData.data.shoppingListItems);
				}
				if (importData.data.settings) {
					await database.settings.bulkAdd(importData.data.settings);
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
		const database = this.ensureDB();
		const [recipes, meals, shoppingListItems] = await Promise.all([
			database.recipes.count(),
			database.meals.count(),
			database.shoppingListItems.count()
		]);

		return { recipes, meals, shoppingListItems };
	}

	// Initialize database with default settings
	static async initializeDatabase(): Promise<void> {
		if (!db) return; // Skip during SSR
		
		const isInitialized = await this.getSetting('initialized');
		
		if (!isInitialized) {
			await this.setSetting('initialized', true);
			await this.setSetting('defaultMealDuration', 2);
			await this.setSetting('weekStartsOn', 1); // Monday
			await this.setSetting('theme', 'light');
		}
	}
}

// Initialize database when module loads (browser only)
if (typeof window !== 'undefined') {
	DatabaseService.initializeDatabase().catch(console.error);
}