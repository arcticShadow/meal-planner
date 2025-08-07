import { format } from 'date-fns';
import { DatabaseService, type Recipe, type Meal, type ShoppingListItem } from './database.js';

// Export data structure
export interface ExportData {
	version: string;
	exportDate: string;
	appName: string;
	data: {
		recipes: Recipe[];
		meals: Meal[];
		shoppingListItems: ShoppingListItem[];
	};
	metadata: {
		recipeCount: number;
		mealCount: number;
		shoppingItemCount: number;
		totalSize: number;
	};
}

// Import result
export interface ImportResult {
	success: boolean;
	imported: {
		recipes: number;
		meals: number;
		shoppingItems: number;
	};
	errors: string[];
	warnings: string[];
}

export class DataExportService {
	private static readonly EXPORT_VERSION = '1.0.0';
	private static readonly APP_NAME = 'Menu Planner';

	/**
	 * Export all data from the database
	 */
	static async exportAllData(): Promise<ExportData> {
		try {
			// Get all data from database
			const [recipes, meals, shoppingItems] = await Promise.all([
				DatabaseService.getAllRecipes(),
				DatabaseService.getAllMeals(),
				DatabaseService.getAllShoppingListItems()
			]);

			// Calculate export size
			const dataString = JSON.stringify({ recipes, meals, shoppingItems });
			const totalSize = new Blob([dataString]).size;

			const exportData: ExportData = {
				version: this.EXPORT_VERSION,
				exportDate: new Date().toISOString(),
				appName: this.APP_NAME,
				data: {
					recipes,
					meals,
					shoppingListItems: shoppingItems
				},
				metadata: {
					recipeCount: recipes.length,
					mealCount: meals.length,
					shoppingItemCount: shoppingItems.length,
					totalSize
				}
			};

			return exportData;
		} catch (error) {
			throw new Error(`Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Export data and download as JSON file
	 */
	static async exportToFile(): Promise<void> {
		try {
			const exportData = await this.exportAllData();
			const jsonString = JSON.stringify(exportData, null, 2);
			const blob = new Blob([jsonString], { type: 'application/json' });
			
			// Create download link
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `menu-planner-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
			a.click();
			
			URL.revokeObjectURL(url);
		} catch (error) {
			throw new Error(`Failed to export to file: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Import data from export file
	 */
	static async importFromData(exportData: unknown, options: {
		clearExisting?: boolean;
		skipDuplicates?: boolean;
	} = {}): Promise<ImportResult> {
		const result: ImportResult = {
			success: false,
			imported: { recipes: 0, meals: 0, shoppingItems: 0 },
			errors: [],
			warnings: []
		};

		try {
			// Validate export data structure
			const validation = this.validateExportData(exportData);
			if (!validation.isValid) {
				result.errors.push(...validation.errors);
				return result;
			}

			// Cast to typed data after validation
			const typedData = exportData as ExportData;
			const { clearExisting = false, skipDuplicates = true } = options;

			// Clear existing data if requested
			if (clearExisting) {
				await Promise.all([
					DatabaseService.clearShoppingList(),
					// Clear all recipes (which also clears meals via cascade)
					DatabaseService.getAllRecipes().then(recipes =>
						Promise.all(recipes.map(r => DatabaseService.deleteRecipe(r.id!)))
					)
				]);
				result.warnings.push('All existing data was cleared before import');
			}

			// Import recipes and get recipe ID mapping
			let recipeIdMapping: Map<string, string> = new Map();
			if (typedData.data.recipes?.length > 0) {
				const recipeImportResult = await this.importRecipes(
					typedData.data.recipes,
					skipDuplicates
				);
				result.imported.recipes = recipeImportResult.imported;
				recipeIdMapping = recipeImportResult.idMapping;
			}

			// Import meals using the recipe ID mapping
			if (typedData.data.meals?.length > 0) {
				result.imported.meals = await this.importMeals(
					typedData.data.meals,
					skipDuplicates,
					recipeIdMapping
				);
			}

			// Import shopping list items (usually not needed but included for completeness)
			if (typedData.data.shoppingListItems?.length > 0) {
				result.imported.shoppingItems = await this.importShoppingItems(
					typedData.data.shoppingListItems
				);
			}

			result.success = true;
			return result;

		} catch (error) {
			result.errors.push(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
			return result;
		}
	}

	/**
	 * Import data from file
	 */
	static async importFromFile(file: File, options: {
		clearExisting?: boolean;
		skipDuplicates?: boolean;
	} = {}): Promise<ImportResult> {
		try {
			const fileContent = await file.text();
			const exportData = JSON.parse(fileContent);
			return await this.importFromData(exportData, options);
		} catch (error) {
			return {
				success: false,
				imported: { recipes: 0, meals: 0, shoppingItems: 0 },
				errors: [`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`],
				warnings: []
			};
		}
	}

	/**
	 * Validate export data structure
	 */
	private static validateExportData(data: unknown): { isValid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!data || typeof data !== 'object') {
			errors.push('Invalid export data: not an object');
			return { isValid: false, errors };
		}

		// Type assertion for validation
		const obj = data as Record<string, unknown>;

		if (!obj.version) {
			errors.push('Missing version information');
		}

		if (!obj.data || typeof obj.data !== 'object') {
			errors.push('Missing or invalid data section');
			return { isValid: false, errors };
		}

		const dataObj = obj.data as Record<string, unknown>;

		if (!Array.isArray(dataObj.recipes)) {
			errors.push('Invalid or missing recipes data');
		}

		if (!Array.isArray(dataObj.meals)) {
			errors.push('Invalid or missing meals data');
		}

		// Check version compatibility
		if (obj.version && obj.version !== this.EXPORT_VERSION) {
			errors.push(`Version mismatch: export version ${obj.version}, expected ${this.EXPORT_VERSION}`);
		}

		return { isValid: errors.length === 0, errors };
	}

	/**
	 * Import recipes with duplicate checking and return ID mapping
	 */
	private static async importRecipes(recipes: Recipe[], skipDuplicates: boolean): Promise<{
		imported: number;
		idMapping: Map<string, string>;
	}> {
		let imported = 0;
		const idMapping = new Map<string, string>();
		const existingRecipes = skipDuplicates ? await DatabaseService.getAllRecipes() : [];
		const existingNames = new Set(existingRecipes.map(r => r.name.toLowerCase()));

		for (const recipe of recipes) {
			try {
				// Skip duplicates if requested
				if (skipDuplicates && existingNames.has(recipe.name?.toLowerCase())) {
					// For duplicates, find the existing recipe and map its ID
					const existingRecipe = existingRecipes.find(r =>
						r.name.toLowerCase() === recipe.name?.toLowerCase()
					);
					if (existingRecipe && recipe.id) {
						idMapping.set(recipe.id, existingRecipe.id!);
					}
					continue;
				}

				// Clean the recipe data (remove id and timestamps for import)
				const cleanRecipe = {
					name: recipe.name,
					description: recipe.description || '',
					images: recipe.images || [],
					ingredients: recipe.ingredients || [],
					instructions: recipe.instructions || '',
					servings: recipe.servings || 4,
					defaultDuration: recipe.defaultDuration || 2,
					tags: recipe.tags || [],
					category: recipe.category,
					prepTime: recipe.prepTime,
					cookTime: recipe.cookTime
				};

				const newRecipeId = await DatabaseService.createRecipe(cleanRecipe);
				
				// Map old ID to new ID
				if (recipe.id) {
					idMapping.set(recipe.id, newRecipeId);
				}
				
				imported++;
			} catch (error) {
				// Log error but continue with other recipes
				console.error(`Failed to import recipe ${recipe.name}:`, error);
			}
		}

		return { imported, idMapping };
	}

	/**
	 * Import meals with duplicate checking and recipe ID mapping
	 */
	private static async importMeals(
		meals: Meal[],
		skipDuplicates: boolean,
		recipeIdMapping: Map<string, string>
	): Promise<number> {
		let imported = 0;
		const existingMeals = skipDuplicates ? await DatabaseService.getAllMeals() : [];
		const existingMealKeys = new Set(
			existingMeals.map(m => `${m.recipeId}-${m.scheduledDate}`)
		);

		for (const meal of meals) {
			try {
				// Map old recipe ID to new recipe ID
				const newRecipeId = recipeIdMapping.get(meal.recipeId);
				if (!newRecipeId) {
					console.warn(`Skipping meal with unmapped recipe ID: ${meal.recipeId}`);
					continue;
				}

				// Skip duplicates if requested
				const mealKey = `${newRecipeId}-${meal.scheduledDate}`;
				if (skipDuplicates && existingMealKeys.has(mealKey)) {
					continue;
				}

				// Clean the meal data with mapped recipe ID
				const cleanMeal = {
					recipeId: newRecipeId,
					scheduledDate: meal.scheduledDate,
					duration: meal.duration || 2,
					excludedIngredients: meal.excludedIngredients || [],
					ingredientSubstitutions: meal.ingredientSubstitutions || {}
				};

				await DatabaseService.createMeal(cleanMeal);
				imported++;
			} catch (error) {
				console.error(`Failed to import meal for date ${meal.scheduledDate}:`, error);
			}
		}

		return imported;
	}

	/**
	 * Import shopping list items
	 */
	private static async importShoppingItems(items: ShoppingListItem[]): Promise<number> {
		let imported = 0;

		// Usually we don't import shopping list items as they're generated from meals
		// But included for completeness in case of backup restoration

		for (const item of items) {
			try {
				const cleanItem = {
					ingredient: item.ingredient,
					quantity: item.quantity || 0,
					unit: item.unit || '',
					mealIds: item.mealIds || [],
					dates: item.dates || [],
					consolidated: item.consolidated || false
				};

				await DatabaseService.createShoppingListItem(cleanItem);
				imported++;
			} catch (error) {
				console.error(`Failed to import shopping item ${item.ingredient}:`, error);
			}
		}

		return imported;
	}

	/**
	 * Get export file info without importing
	 */
	static async getExportInfo(file: File): Promise<{
		isValid: boolean;
		info?: {
			version: string;
			exportDate: string;
			appName: string;
			recipeCount: number;
			mealCount: number;
			shoppingItemCount: number;
			fileSize: number;
		};
		errors: string[];
	}> {
		try {
			const fileContent = await file.text();
			const exportData = JSON.parse(fileContent);
			
			const validation = this.validateExportData(exportData);
			if (!validation.isValid) {
				return { isValid: false, errors: validation.errors };
			}

			return {
				isValid: true,
				info: {
					version: exportData.version,
					exportDate: exportData.exportDate,
					appName: exportData.appName,
					recipeCount: exportData.metadata?.recipeCount || exportData.data.recipes?.length || 0,
					mealCount: exportData.metadata?.mealCount || exportData.data.meals?.length || 0,
					shoppingItemCount: exportData.metadata?.shoppingItemCount || exportData.data.shoppingListItems?.length || 0,
					fileSize: file.size
				},
				errors: []
			};
		} catch (error) {
			return {
				isValid: false,
				errors: [`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`]
			};
		}
	}
}