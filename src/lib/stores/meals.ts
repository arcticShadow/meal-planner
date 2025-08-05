import { writable, derived } from 'svelte/store';
import { format, addDays, parseISO } from 'date-fns';
import { DatabaseService, type Meal, type Recipe } from '../services/database.js';
import { validateMeal, sanitizeMeal } from '../utils/validators.js';
import { recipeStore } from './recipes.js';
import { syncStore } from './sync.js';

// Meal store state
interface MealState {
	meals: Meal[];
	loading: boolean;
	error: string | null;
	currentWeekStart: Date;
}

// Initial state
const initialState: MealState = {
	meals: [],
	loading: false,
	error: null,
	currentWeekStart: new Date()
};

// Create the main store
const { subscribe, update } = writable<MealState>(initialState);

// Meal store actions
export const mealStore = {
	subscribe,

	// Load all meals from database
	async loadMeals() {
		update(state => ({ ...state, loading: true, error: null }));
		
		try {
			const meals = await DatabaseService.getAllMeals();
			update(state => ({ ...state, meals, loading: false }));
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to load meals'
			}));
		}
	},

	// Load meals for a specific date range
	async loadMealsForDateRange(startDate: string, endDate: string) {
		update(state => ({ ...state, loading: true, error: null }));
		
		try {
			const meals = await DatabaseService.getMealsForDateRange(startDate, endDate);
			update(state => ({ ...state, meals, loading: false }));
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to load meals'
			}));
		}
	},

	// Add a new meal
	async addMeal(mealData: Omit<Meal, 'id' | 'createdAt'>) {
		update(state => ({ ...state, loading: true, error: null }));

		try {
			// Validate and sanitize the meal
			const sanitized = sanitizeMeal(mealData);
			const validation = validateMeal(sanitized);
			
			if (!validation.isValid) {
				const errorMessage = validation.errors.map(e => e.message).join(', ');
				throw new Error(`Validation failed: ${errorMessage}`);
			}

			// Check for date conflicts across meal duration
			const hasConflict = await checkMealConflicts(mealData.scheduledDate, mealData.duration);
			if (hasConflict) {
				throw new Error(`This meal conflicts with an existing meal during its ${mealData.duration}-day duration`);
			}

			// Add to database
			const id = await DatabaseService.createMeal(sanitized as Omit<Meal, 'id' | 'createdAt'>);
			const newMeal = await DatabaseService.getMeal(id);
			
			if (newMeal) {
				update(state => ({
					...state,
					meals: [...state.meals, newMeal].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
					loading: false
				}));

				// Broadcast to connected peers
				await syncStore.broadcastMealCreate(newMeal);
			}

			return id;
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to add meal'
			}));
			throw error;
		}
	},

	// Update an existing meal
	async updateMeal(id: string, changes: Partial<Meal>) {
		update(state => ({ ...state, loading: true, error: null }));

		try {
			// Get current meal for validation
			const currentMeal = await DatabaseService.getMeal(id);
			if (!currentMeal) {
				throw new Error('Meal not found');
			}

			// Merge changes and validate
			const updatedMeal = { ...currentMeal, ...changes };
			const sanitized = sanitizeMeal(updatedMeal);
			const validation = validateMeal(sanitized);
			
			if (!validation.isValid) {
				const errorMessage = validation.errors.map(e => e.message).join(', ');
				throw new Error(`Validation failed: ${errorMessage}`);
			}

			// Check for date conflicts if date or duration is being changed
			if (changes.scheduledDate || changes.duration) {
				const newDate = changes.scheduledDate || currentMeal.scheduledDate;
				const newDuration = changes.duration || currentMeal.duration;
				const hasConflict = await checkMealConflicts(newDate, newDuration, id);
				if (hasConflict) {
					throw new Error(`This meal conflicts with an existing meal during its ${newDuration}-day duration`);
				}
			}

			// Update in database
			await DatabaseService.updateMeal(id, sanitized);
			const updated = await DatabaseService.getMeal(id);
			
			if (updated) {
				update(state => ({
					...state,
					meals: state.meals.map(meal =>
						meal.id === id ? updated : meal
					).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
					loading: false
				}));

				// Broadcast to connected peers
				await syncStore.broadcastMealUpdate(updated);
			}
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to update meal'
			}));
			throw error;
		}
	},

	// Delete a meal
	async deleteMeal(id: string) {
		update(state => ({ ...state, loading: true, error: null }));

		try {
			// Get meal before deletion for sync broadcast
			const mealToDelete = await DatabaseService.getMeal(id);
			
			await DatabaseService.deleteMeal(id);
			update(state => ({
				...state,
				meals: state.meals.filter(meal => meal.id !== id),
				loading: false
			}));

			// Broadcast to connected peers
			if (mealToDelete) {
				await syncStore.broadcastMealDelete(mealToDelete);
			}
		} catch (error) {
			update(state => ({ 
				...state, 
				loading: false, 
				error: error instanceof Error ? error.message : 'Failed to delete meal'
			}));
			throw error;
		}
	},

	// Find the next available date for meal planning
	async findNextAvailableDate(startDate?: Date, duration: number = 2): Promise<string> {
		const start = startDate || new Date();
		
		// Find the first available date that can accommodate the meal duration
		let currentDate = start;
		let attempts = 0;
		const maxAttempts = 365; // Don't check more than a year ahead
		
		while (attempts < maxAttempts) {
			const dateStr = format(currentDate, 'yyyy-MM-dd');
			const hasConflict = await checkMealConflicts(dateStr, duration);
			
			if (!hasConflict) {
				return dateStr;
			}
			
			currentDate = addDays(currentDate, 1);
			attempts++;
		}

		// Fallback to the start date if no available date found
		return format(start, 'yyyy-MM-dd');
	},

	// Suggest meals for empty dates in a week
	async suggestMealsForWeek(weekStart: Date) {
		const suggestions: { date: string; availableRecipes: Recipe[] }[] = [];
		
		// Get all recipes and meals for the week
		const recipes = await DatabaseService.getAllRecipes();
		const weekEnd = addDays(weekStart, 6);
		const weekMeals = await DatabaseService.getMealsForDateRange(
			format(weekStart, 'yyyy-MM-dd'),
			format(weekEnd, 'yyyy-MM-dd')
		);

		const occupiedDates = new Set(weekMeals.map(meal => meal.scheduledDate));

		// Check each day of the week
		for (let i = 0; i < 7; i++) {
			const date = addDays(weekStart, i);
			const dateStr = format(date, 'yyyy-MM-dd');
			
			if (!occupiedDates.has(dateStr)) {
				suggestions.push({
					date: dateStr,
					availableRecipes: recipes.slice(0, 3) // Suggest first 3 recipes for now
				});
			}
		}

		return suggestions;
	},

	// Set current week for calendar view
	setCurrentWeek(weekStart: Date) {
		update(state => ({ ...state, currentWeekStart: weekStart }));
	},

	// Clear error
	clearError() {
		update(state => ({ ...state, error: null }));
	}
};

// Helper function to check for meal conflicts across duration
async function checkMealConflicts(startDate: string, duration: number, excludeMealId?: string): Promise<boolean> {
	const meals = await DatabaseService.getAllMeals();
	const filteredMeals = excludeMealId ? meals.filter(m => m.id !== excludeMealId) : meals;
	
	// Generate all dates that the new meal would occupy
	const newMealDates = new Set<string>();
	for (let i = 0; i < duration; i++) {
		const date = addDays(parseISO(startDate), i);
		newMealDates.add(format(date, 'yyyy-MM-dd'));
	}
	
	// Check if any existing meal overlaps with these dates
	for (const meal of filteredMeals) {
		// Generate all dates that the existing meal occupies
		for (let i = 0; i < meal.duration; i++) {
			const date = addDays(parseISO(meal.scheduledDate), i);
			const dateStr = format(date, 'yyyy-MM-dd');
			
			if (newMealDates.has(dateStr)) {
				return true; // Conflict found
			}
		}
	}
	
	return false; // No conflict
}

// Derived stores for computed values
export const mealsWithRecipes = derived(
	[mealStore, recipeStore],
	([$mealStore, $recipeStore]) => {
		return $mealStore.meals.map(meal => {
			const recipe = $recipeStore.recipes.find(r => r.id === meal.recipeId);
			return {
				...meal,
				recipe: recipe || null
			};
		});
	}
);

// Get meals for current week
export const currentWeekMeals = derived(
	[mealStore, mealsWithRecipes],
	([$mealStore, $mealsWithRecipes]) => {
		const weekStart = format($mealStore.currentWeekStart, 'yyyy-MM-dd');
		const weekEnd = format(addDays($mealStore.currentWeekStart, 6), 'yyyy-MM-dd');
		
		return $mealsWithRecipes.filter(meal => 
			meal.scheduledDate >= weekStart && meal.scheduledDate <= weekEnd
		);
	}
);

// Get meals grouped by date
export const mealsByDate = derived(
	mealsWithRecipes,
	($mealsWithRecipes) => {
		const grouped: Record<string, typeof $mealsWithRecipes> = {};
		
		$mealsWithRecipes.forEach(meal => {
			if (!grouped[meal.scheduledDate]) {
				grouped[meal.scheduledDate] = [];
			}
			grouped[meal.scheduledDate].push(meal);
		});

		return grouped;
	}
);

// Get meals expanded across their duration (for calendar display)
export const expandedMealsByDate = derived(
	mealsWithRecipes,
	($mealsWithRecipes) => {
		const expanded: Record<string, Array<typeof $mealsWithRecipes[0] & {
			isOriginalDay: boolean;
			dayNumber: number;
			totalDays: number
		}>> = {};
		
		$mealsWithRecipes.forEach(meal => {
			// Add meal to each day of its duration
			for (let i = 0; i < meal.duration; i++) {
				const date = addDays(parseISO(meal.scheduledDate), i);
				const dateStr = format(date, 'yyyy-MM-dd');
				
				if (!expanded[dateStr]) {
					expanded[dateStr] = [];
				}
				
				expanded[dateStr].push({
					...meal,
					isOriginalDay: i === 0,
					dayNumber: i + 1,
					totalDays: meal.duration
				});
			}
		});

		return expanded;
	}
);

// Meal planning statistics
export const mealStats = derived(
	[mealStore, mealsWithRecipes],
	([$mealStore, $mealsWithRecipes]) => {
		const now = new Date();
		const today = format(now, 'yyyy-MM-dd');
		const nextWeek = format(addDays(now, 7), 'yyyy-MM-dd');

		const upcomingMeals = $mealsWithRecipes.filter(meal => meal.scheduledDate >= today);
		const thisWeekMeals = $mealsWithRecipes.filter(meal => 
			meal.scheduledDate >= today && meal.scheduledDate < nextWeek
		);

		return {
			total: $mealStore.meals.length,
			upcoming: upcomingMeals.length,
			thisWeek: thisWeekMeals.length,
			uniqueRecipes: new Set($mealStore.meals.map(m => m.recipeId)).size
		};
	}
);

// Get available dates for meal planning (next 30 days without conflicts)
export const availableDates = derived(
	mealStore,
	($mealStore) => {
		const dates: string[] = [];
		const occupiedDates = new Set($mealStore.meals.map(meal => meal.scheduledDate));
		const today = new Date();

		for (let i = 0; i < 30; i++) {
			const date = addDays(today, i);
			const dateStr = format(date, 'yyyy-MM-dd');
			
			if (!occupiedDates.has(dateStr)) {
				dates.push(dateStr);
			}
		}

		return dates;
	}
);