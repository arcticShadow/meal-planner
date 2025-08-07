import type { Recipe, Ingredient, Meal, RecipeImage } from '../services/database.js';

// Validation error type
export interface ValidationError {
	field: string;
	message: string;
}

export interface ValidationResult {
	isValid: boolean;
	errors: ValidationError[];
}

// Recipe validation
export function validateRecipe(recipe: Partial<Recipe>): ValidationResult {
	const errors: ValidationError[] = [];

	// Required fields
	if (!recipe.name || recipe.name.trim().length === 0) {
		errors.push({ field: 'name', message: 'Recipe name is required' });
	} else if (recipe.name.trim().length > 100) {
		errors.push({ field: 'name', message: 'Recipe name must be 100 characters or less' });
	}

	if (!recipe.description || recipe.description.trim().length === 0) {
		errors.push({ field: 'description', message: 'Recipe description is required' });
	} else if (recipe.description.trim().length > 500) {
		errors.push({ field: 'description', message: 'Recipe description must be 500 characters or less' });
	}

	// Ingredients validation
	if (!recipe.ingredients || recipe.ingredients.length === 0) {
		errors.push({ field: 'ingredients', message: 'At least one ingredient is required' });
	} else {
		recipe.ingredients.forEach((ingredient, index) => {
			const ingredientErrors = validateIngredient(ingredient);
			ingredientErrors.errors.forEach(error => {
				errors.push({
					field: `ingredients[${index}].${error.field}`,
					message: error.message
				});
			});
		});
	}

	// Instructions validation
	if (!recipe.instructions || recipe.instructions.length === 0) {
		errors.push({ field: 'instructions', message: 'At least one instruction is required' });
	} else {
		recipe.instructions.forEach((instruction, index) => {
			if (!instruction || instruction.trim().length === 0) {
				errors.push({
					field: `instructions[${index}]`,
					message: 'Instruction cannot be empty'
				});
			} else if (instruction.trim().length > 500) {
				errors.push({
					field: `instructions[${index}]`,
					message: 'Instruction must be 500 characters or less'
				});
			}
		});
	}

	// Servings validation
	if (recipe.servings === undefined || recipe.servings === null) {
		errors.push({ field: 'servings', message: 'Number of servings is required' });
	} else if (recipe.servings < 1 || recipe.servings > 50) {
		errors.push({ field: 'servings', message: 'Servings must be between 1 and 50' });
	}

	// Default duration validation
	if (recipe.defaultDuration === undefined || recipe.defaultDuration === null) {
		errors.push({ field: 'defaultDuration', message: 'Default duration is required' });
	} else if (recipe.defaultDuration < 1 || recipe.defaultDuration > 14) {
		errors.push({ field: 'defaultDuration', message: 'Default duration must be between 1 and 14 days' });
	}

	// Tags validation
	if (recipe.tags) {
		recipe.tags.forEach((tag, index) => {
			if (!tag || tag.trim().length === 0) {
				errors.push({
					field: `tags[${index}]`,
					message: 'Tag cannot be empty'
				});
			} else if (tag.trim().length > 30) {
				errors.push({
					field: `tags[${index}]`,
					message: 'Tag must be 30 characters or less'
				});
			}
		});
	}

	// Optional time validations
	if (recipe.prepTime !== undefined && (recipe.prepTime < 0 || recipe.prepTime > 1440)) {
		errors.push({ field: 'prepTime', message: 'Prep time must be between 0 and 1440 minutes (24 hours)' });
	}

	if (recipe.cookTime !== undefined && (recipe.cookTime < 0 || recipe.cookTime > 1440)) {
		errors.push({ field: 'cookTime', message: 'Cook time must be between 0 and 1440 minutes (24 hours)' });
	}

	// Category validation
	if (recipe.category && recipe.category.trim().length > 50) {
		errors.push({ field: 'category', message: 'Category must be 50 characters or less' });
	}

	// Images validation
	if (recipe.images) {
		recipe.images.forEach((image, index) => {
			const imageErrors = validateRecipeImage(image);
			imageErrors.errors.forEach(error => {
				errors.push({
					field: `images[${index}].${error.field}`,
					message: error.message
				});
			});
		});
	}

	return {
		isValid: errors.length === 0,
		errors
	};
}

// Ingredient validation
export function validateIngredient(ingredient: Partial<Ingredient>): ValidationResult {
	const errors: ValidationError[] = [];

	if (!ingredient.name || ingredient.name.trim().length === 0) {
		errors.push({ field: 'name', message: 'Ingredient name is required' });
	} else if (ingredient.name.trim().length > 100) {
		errors.push({ field: 'name', message: 'Ingredient name must be 100 characters or less' });
	}

	if (ingredient.quantity === undefined || ingredient.quantity === null) {
		errors.push({ field: 'quantity', message: 'Ingredient quantity is required' });
	} else if (ingredient.quantity <= 0) {
		errors.push({ field: 'quantity', message: 'Ingredient quantity must be greater than 0' });
	} else if (ingredient.quantity > 10000) {
		errors.push({ field: 'quantity', message: 'Ingredient quantity must be 10000 or less' });
	}

	if (!ingredient.unit || ingredient.unit.trim().length === 0) {
		errors.push({ field: 'unit', message: 'Ingredient unit is required' });
	} else if (ingredient.unit.trim().length > 20) {
		errors.push({ field: 'unit', message: 'Ingredient unit must be 20 characters or less' });
	}

	return {
		isValid: errors.length === 0,
		errors
	};
}

// Recipe image validation
export function validateRecipeImage(image: Partial<RecipeImage>): ValidationResult {
	const errors: ValidationError[] = [];

	if (!image.src || image.src.trim().length === 0) {
		errors.push({ field: 'src', message: 'Image URL is required' });
	} else if (image.src.trim().length > 500) {
		errors.push({ field: 'src', message: 'Image URL must be 500 characters or less' });
	} else {
		// Basic URL validation
		try {
			new URL(image.src);
		} catch {
			// If it's not a valid URL, check if it's a relative path
			if (!image.src.startsWith('/') && !image.src.startsWith('./') && !image.src.startsWith('../')) {
				errors.push({ field: 'src', message: 'Image src must be a valid URL or relative path' });
			}
		}
	}

	return {
		isValid: errors.length === 0,
		errors
	};
}

// Meal validation
export function validateMeal(meal: Partial<Meal>): ValidationResult {
	const errors: ValidationError[] = [];

	if (!meal.recipeId || meal.recipeId.trim().length === 0) {
		errors.push({ field: 'recipeId', message: 'Recipe ID is required' });
	}

	if (!meal.scheduledDate || meal.scheduledDate.trim().length === 0) {
		errors.push({ field: 'scheduledDate', message: 'Scheduled date is required' });
	} else {
		// Validate date format (YYYY-MM-DD)
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!dateRegex.test(meal.scheduledDate)) {
			errors.push({ field: 'scheduledDate', message: 'Scheduled date must be in YYYY-MM-DD format' });
		} else {
			// Validate that it's a valid date
			const date = new Date(meal.scheduledDate);
			if (isNaN(date.getTime())) {
				errors.push({ field: 'scheduledDate', message: 'Scheduled date must be a valid date' });
			}
		}
	}

	if (meal.duration === undefined || meal.duration === null) {
		errors.push({ field: 'duration', message: 'Meal duration is required' });
	} else if (meal.duration < 1 || meal.duration > 14) {
		errors.push({ field: 'duration', message: 'Meal duration must be between 1 and 14 days' });
	}

	// Validate excluded ingredients
	if (meal.excludedIngredients) {
		meal.excludedIngredients.forEach((ingredient, index) => {
			if (!ingredient || ingredient.trim().length === 0) {
				errors.push({
					field: `excludedIngredients[${index}]`,
					message: 'Excluded ingredient name cannot be empty'
				});
			}
		});
	}

	return {
		isValid: errors.length === 0,
		errors
	};
}

// JSON recipe import validation
export function validateRecipeImport(data: unknown): ValidationResult {
	const errors: ValidationError[] = [];

	if (!data || typeof data !== 'object') {
		errors.push({ field: 'root', message: 'Import data must be an object' });
		return { isValid: false, errors };
	}

	const recipes = (data as Record<string, unknown>).recipes;
	if (!Array.isArray(recipes)) {
		errors.push({ field: 'recipes', message: 'Import data must contain a "recipes" array' });
		return { isValid: false, errors };
	}

	recipes.forEach((recipe, index) => {
		const recipeValidation = validateRecipe(recipe);
		recipeValidation.errors.forEach(error => {
			errors.push({
				field: `recipes[${index}].${error.field}`,
				message: error.message
			});
		});
	});

	return {
		isValid: errors.length === 0,
		errors
	};
}

// Sanitization functions
export function sanitizeRecipe(recipe: Partial<Recipe>): Partial<Recipe> {
	return {
		...recipe,
		name: recipe.name?.trim(),
		description: recipe.description?.trim(),
		category: recipe.category?.trim(),
		images: recipe.images?.map(image => sanitizeRecipeImage(image) as RecipeImage).filter(img => img.src.length > 0),
		tags: recipe.tags?.map(tag => tag.trim()).filter(tag => tag.length > 0),
		ingredients: recipe.ingredients?.map(ingredient => sanitizeIngredient(ingredient) as Ingredient),
		instructions: recipe.instructions?.map(instruction => instruction.trim()).filter(instruction => instruction.length > 0)
	};
}

export function sanitizeRecipeImage(image: Partial<RecipeImage>): RecipeImage {
	return {
		src: image.src?.trim() || ''
	};
}

export function sanitizeIngredient(ingredient: Partial<Ingredient>): Ingredient {
	return {
		name: ingredient.name?.trim() || '',
		quantity: ingredient.quantity || 0,
		unit: ingredient.unit?.trim() || '',
		optional: ingredient.optional || false
	};
}

export function sanitizeMeal(meal: Partial<Meal>): Partial<Meal> {
	return {
		...meal,
		recipeId: meal.recipeId?.trim(),
		scheduledDate: meal.scheduledDate?.trim(),
		excludedIngredients: meal.excludedIngredients?.map(ingredient => ingredient.trim()).filter(ingredient => ingredient.length > 0)
	};
}

// Common validation patterns
export const VALIDATION_PATTERNS = {
	DATE_ISO: /^\d{4}-\d{2}-\d{2}$/,
	EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
};

// Common units for ingredients
export const COMMON_UNITS = [
	// Weight
	'g', 'kg', 'oz', 'lb',
	// Volume
	'ml', 'l', 'cup', 'tbsp', 'tsp', 'fl oz', 'pint', 'quart', 'gallon',
	// Count
	'piece', 'pieces', 'item', 'items', 'clove', 'cloves',
	// Other
	'pinch', 'dash', 'handful', 'slice', 'slices', 'can', 'jar', 'packet', 'bunch'
];

// Common recipe categories
export const RECIPE_CATEGORIES = [
	'Breakfast',
	'Lunch', 
	'Dinner',
	'Snack',
	'Dessert',
	'Appetizer'
];