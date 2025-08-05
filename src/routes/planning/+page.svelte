<script lang="ts">
	import { format, addDays, startOfWeek } from 'date-fns';
	import { onMount } from 'svelte';
	import { mealStore, currentWeekMeals, mealStats } from '../../lib/stores/meals.js';
	import { recipeStore } from '../../lib/stores/recipes.js';
	import MealCalendar from '../../lib/components/meal-planning/MealCalendar.svelte';
	import MealScheduler from '../../lib/components/meal-planning/MealScheduler.svelte';
	import type { Recipe } from '../../lib/services/database.js';

	// Calendar state
	let currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
	
	// Scheduler state
	let showScheduler = false;
	let selectedDate = '';
	let selectedRecipe: Recipe | null = null;
	let editingMealId: string | null = null;

	// Loading and error states
	let loading = false;
	let error = '';

	// Handle adding a new meal
	function handleAddMeal(event: CustomEvent<{ date: string }>) {
		selectedDate = event.detail.date;
		selectedRecipe = null;
		editingMealId = null;
		showScheduler = true;
	}

	// Handle editing an existing meal
	async function handleEditMeal(event: CustomEvent<{ mealId: string }>) {
		editingMealId = event.detail.mealId;
		
		// Load meal data for editing
		try {
			loading = true;
			await mealStore.loadMeals(); // Ensure we have latest data
			
			// Find the meal in the store
			const meal = $mealStore.meals.find(m => m.id === event.detail.mealId);
			if (!meal) {
				error = 'Meal not found';
				return;
			}

			// Find the associated recipe
			const recipe = $recipeStore.recipes.find(r => r.id === meal.recipeId);
			if (!recipe) {
				error = 'Recipe not found';
				return;
			}

			selectedDate = meal.scheduledDate;
			selectedRecipe = recipe;
			showScheduler = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load meal data';
		} finally {
			loading = false;
		}
	}

	// Handle week navigation
	function handleWeekChanged(event: CustomEvent<{ weekStart: Date }>) {
		currentWeekStart = event.detail.weekStart;
	}

	// Handle meal scheduled/updated
	function handleMealScheduled(event: CustomEvent<{ mealId: string; date: string }>) {
		// Reload meals to reflect changes
		mealStore.loadMeals();
		
		// Show success message
		const action = editingMealId ? 'updated' : 'scheduled';
		// In a real app, you might use a toast notification here
		console.log(`Meal ${action} successfully for ${event.detail.date}`);
	}

	// Quick actions
	async function handleSuggestMeals() {
		if (loading) return;
		
		loading = true;
		error = '';
		
		try {
			const suggestions = await mealStore.suggestMealsForWeek(currentWeekStart);
			
			if (suggestions.length === 0) {
				error = 'No empty days found this week!';
				return;
			}

			// For now, just schedule the first available recipe for each empty day
			// In a full implementation, this could open a detailed suggestion modal
			for (const suggestion of suggestions) {
				if (suggestion.availableRecipes.length > 0) {
					const recipe = suggestion.availableRecipes[0];
					await mealStore.addMeal({
						recipeId: recipe.id!,
						scheduledDate: suggestion.date,
						duration: 2, // Default duration
						excludedIngredients: [],
						ingredientSubstitutions: {}
					});
				}
			}
			
			// Reload meals to show new suggestions
			await mealStore.loadMeals();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to suggest meals';
		} finally {
			loading = false;
		}
	}

	async function handleCopyLastWeek() {
		if (loading) return;
		
		loading = true;
		error = '';
		
		try {
			const lastWeekStart = addDays(currentWeekStart, -7);
			const lastWeekEnd = addDays(lastWeekStart, 6);
			
			// Get last week's meals from the store after loading
			await mealStore.loadMealsForDateRange(
				format(lastWeekStart, 'yyyy-MM-dd'),
				format(lastWeekEnd, 'yyyy-MM-dd')
			);
			
			// Filter meals from the store state for last week
			const lastWeekMeals = $mealStore.meals.filter(meal => {
				const mealDate = meal.scheduledDate;
				return mealDate >= format(lastWeekStart, 'yyyy-MM-dd') &&
					   mealDate <= format(lastWeekEnd, 'yyyy-MM-dd');
			});
			
			if (lastWeekMeals.length === 0) {
				error = 'No meals found in the previous week to copy';
				return;
			}

			// Copy meals to current week with date adjustment
			for (const meal of lastWeekMeals) {
				const mealDate = new Date(meal.scheduledDate);
				const dayOffset = Math.floor((mealDate.getTime() - lastWeekStart.getTime()) / (1000 * 60 * 60 * 24));
				const newDate = addDays(currentWeekStart, dayOffset);
				const newDateStr = format(newDate, 'yyyy-MM-dd');
				
				// Check if the date is already occupied
				const existingMeals = $mealStore.meals.filter(m => m.scheduledDate === newDateStr);
				if (existingMeals.length === 0) {
					await mealStore.addMeal({
						recipeId: meal.recipeId,
						scheduledDate: newDateStr,
						duration: meal.duration,
						excludedIngredients: meal.excludedIngredients,
						ingredientSubstitutions: {}
					});
				}
			}
			
			// Reload meals to show copied meals
			await mealStore.loadMeals();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to copy last week\'s meals';
		} finally {
			loading = false;
		}
	}

	function handleGenerateShoppingList() {
		// Navigate to shopping list page
		// In a real app, this might generate the list and navigate
		window.location.href = '/shopping';
	}

	function clearError() {
		error = '';
	}

	// Load data when component mounts
	onMount(async () => {
		loading = true;
		try {
			await Promise.all([
				mealStore.loadMeals(),
				recipeStore.loadRecipes()
			]);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load data';
		} finally {
			loading = false;
		}
	});

	// Reactive statements for store subscriptions
	$: mealStore.setCurrentWeek(currentWeekStart);
</script>

<svelte:head>
	<title>Meal Planning - Menu Planner</title>
</svelte:head>

<div class="page-header">
	<h1>Meal Planning</h1>
	<p>Schedule your meals and plan ahead</p>
</div>

{#if error}
	<div class="alert alert-error" role="alert">
		{error}
		<button class="alert-close" on:click={clearError} aria-label="Close error message">×</button>
	</div>
{/if}

{#if loading && !showScheduler}
	<div class="loading-spinner" aria-label="Loading meal planning data">
		<p>Loading...</p>
	</div>
{:else}
	<!-- Main Calendar View -->
	<MealCalendar
		bind:currentWeekStart
		on:addMeal={handleAddMeal}
		on:editMeal={handleEditMeal}
		on:weekChanged={handleWeekChanged}
	/>

	<!-- Summary and Quick Actions -->
	<div class="planning-summary">
		<div class="row">
			<div class="column column-50">
				<div class="card">
					<div class="card-header">
						<h3 class="card-title">This Week's Summary</h3>
					</div>
					<div class="summary-stats">
						<div class="stat-item">
							<span class="stat-number">{$currentWeekMeals.length}</span>
							<span class="stat-label">Meals Planned</span>
						</div>
						<div class="stat-item">
							<span class="stat-number">{$mealStats.uniqueRecipes}</span>
							<span class="stat-label">Recipes Used</span>
						</div>
						<div class="stat-item">
							<span class="stat-number">{$mealStats.upcoming}</span>
							<span class="stat-label">Upcoming Meals</span>
						</div>
					</div>
				</div>
			</div>
			
			<div class="column column-50">
				<div class="card">
					<div class="card-header">
						<h3 class="card-title">Quick Actions</h3>
					</div>
					<div class="quick-actions">
						<button 
							class="button button-outline" 
							style="width: 100%; margin-bottom: 1rem;"
							on:click={handleSuggestMeals}
							disabled={loading}
						>
							{loading ? 'Loading...' : 'Suggest Meals for Empty Days'}
						</button>
						<button 
							class="button button-outline" 
							style="width: 100%; margin-bottom: 1rem;"
							on:click={handleCopyLastWeek}
							disabled={loading}
						>
							{loading ? 'Loading...' : 'Copy Last Week\'s Plan'}
						</button>
						<button 
							class="button button-outline" 
							style="width: 100%;"
							on:click={handleGenerateShoppingList}
						>
							Generate Shopping List
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Meal Scheduler Modal -->
<MealScheduler
	bind:isOpen={showScheduler}
	bind:selectedDate
	bind:selectedRecipe
	bind:editingMealId
	on:close={() => showScheduler = false}
	on:mealScheduled={handleMealScheduled}
/>

<style>
	.page-header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.page-header h1 {
		margin-bottom: 0.5rem;
	}

	.page-header p {
		color: #606c76;
		font-size: 1.6rem;
	}

	.alert {
		padding: 1.5rem;
		margin-bottom: 2rem;
		border-radius: 0.4rem;
		position: relative;
	}

	.alert-error {
		background-color: #f8d7da;
		border: 0.1rem solid #f5c6cb;
		color: #721c24;
	}

	.alert-close {
		position: absolute;
		top: 1rem;
		right: 1.5rem;
		background: none;
		border: none;
		font-size: 1.8rem;
		cursor: pointer;
		color: inherit;
		opacity: 0.7;
		line-height: 1;
		padding: 0;
	}

	.alert-close:hover {
		opacity: 1;
	}

	.loading-spinner {
		text-align: center;
		padding: 4rem 0;
		color: #606c76;
	}

	.planning-summary {
		margin-bottom: 2rem;
	}

	.card {
		border: 0.1rem solid #e1e1e1;
		border-radius: 0.4rem;
		overflow: hidden;
	}

	.card-header {
		background-color: #f4f5f6;
		padding: 1.5rem;
		border-bottom: 0.1rem solid #e1e1e1;
	}

	.card-title {
		margin: 0;
		color: #2c3e50;
		font-size: 1.8rem;
	}

	.summary-stats {
		display: flex;
		justify-content: space-around;
		text-align: center;
		padding: 2rem 1.5rem;
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-number {
		font-size: 2.4rem;
		font-weight: 600;
		color: #9b4dca;
		margin-bottom: 0.5rem;
	}

	.stat-label {
		font-size: 1.2rem;
		color: #606c76;
	}

	.quick-actions {
		display: flex;
		flex-direction: column;
		padding: 1.5rem;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.summary-stats {
			flex-direction: column;
			gap: 1rem;
		}
	}

	@media (max-width: 40rem) {
		.planning-summary .row {
			flex-direction: column;
		}
	}
</style>