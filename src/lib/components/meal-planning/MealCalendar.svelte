<script lang="ts">
	import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
	import { mealStore, expandedMealsByDate, currentWeekMeals } from '../../stores/meals.js';
	import { recipeStore } from '../../stores/recipes.js';
	import { createEventDispatcher, onMount } from 'svelte';
	import type { Recipe } from '../../services/database.js';

	export let currentWeekStart: Date = startOfWeek(new Date(), { weekStartsOn: 1 });
	
	const dispatch = createEventDispatcher<{
		addMeal: { date: string };
		editMeal: { mealId: string };
		weekChanged: { weekStart: Date };
	}>();

	interface DayData {
		date: Date;
		dayName: string;
		dayNumber: string;
		fullDate: string;
		isToday: boolean;
		isPast: boolean;
		meals: Array<{
			id: string;
			recipeId: string;
			scheduledDate: string;
			duration: number;
			excludedIngredients: string[];
			recipe: Recipe | null;
			isOriginalDay: boolean;
			dayNumber: number;
			totalDays: number;
		}>;
	}

	let weekDays: DayData[] = [];
	let loading = false;

	// Reactive statement to generate week days when currentWeekStart changes
	$: generateWeekDays(currentWeekStart);
	$: updateMealsInDays($expandedMealsByDate);

	function generateWeekDays(weekStart: Date) {
		const today = new Date();
		weekDays = Array.from({ length: 7 }, (_, i) => {
			const date = addDays(weekStart, i);
			return {
				date,
				dayName: format(date, 'EEE'),
				dayNumber: format(date, 'd'),
				fullDate: format(date, 'yyyy-MM-dd'),
				isToday: isSameDay(date, today),
				isPast: date < today && !isSameDay(date, today),
				meals: []
			};
		});
	}

	function updateMealsInDays(mealsByDateMap: Record<string, any[]>) {
		weekDays = weekDays.map(day => ({
			...day,
			meals: mealsByDateMap[day.fullDate] || []
		}));
	}

	function handleAddMeal(date: string) {
		dispatch('addMeal', { date });
	}

	function handleEditMeal(mealId: string) {
		dispatch('editMeal', { mealId });
	}

	function handlePreviousWeek() {
		const newWeekStart = addDays(currentWeekStart, -7);
		currentWeekStart = newWeekStart;
		mealStore.setCurrentWeek(newWeekStart);
		dispatch('weekChanged', { weekStart: newWeekStart });
	}

	function handleNextWeek() {
		const newWeekStart = addDays(currentWeekStart, 7);
		currentWeekStart = newWeekStart;
		mealStore.setCurrentWeek(newWeekStart);
		dispatch('weekChanged', { weekStart: newWeekStart });
	}

	async function handleSuggestMeals() {
		if (loading) return;
		
		loading = true;
		try {
			const suggestions = await mealStore.suggestMealsForWeek(currentWeekStart);
			
			if (suggestions.length === 0) {
				alert('No empty days found this week!');
				return;
			}

			// For now, just show an alert with the suggestions
			// In a full implementation, this could open a modal with recipe options
			const message = suggestions.map(s => 
				`${format(new Date(s.date), 'EEEE, MMM d')}: ${s.availableRecipes.length} recipes available`
			).join('\n');
			
			alert(`Meal suggestions for empty days:\n\n${message}`);
		} catch (error) {
			console.error('Error getting meal suggestions:', error);
			alert('Failed to get meal suggestions');
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		// Load meals when component mounts
		mealStore.loadMeals();
		mealStore.setCurrentWeek(currentWeekStart);
	});
</script>

<div class="meal-calendar">
	<!-- Calendar Controls -->
	<div class="calendar-controls">
		<div class="date-navigation">
			<button 
				class="button button-outline" 
				on:click={handlePreviousWeek}
				aria-label="Previous week"
			>
				← Previous Week
			</button>
			<span class="current-week">
				{format(currentWeekStart, 'MMM d')} - {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}
			</span>
			<button 
				class="button button-outline" 
				on:click={handleNextWeek}
				aria-label="Next week"
			>
				Next Week →
			</button>
		</div>
		
		<div class="calendar-actions">
			<button 
				class="button button-outline" 
				on:click={handleSuggestMeals}
				disabled={loading}
				aria-label="Suggest meals for empty days"
			>
				{loading ? 'Loading...' : 'Suggest Meals'}
			</button>
		</div>
	</div>

	<!-- Calendar Grid -->
	<div class="calendar-grid" role="grid" aria-label="Weekly meal calendar">
		{#each weekDays as day}
			<div 
				class="day-column"
				class:today={day.isToday}
				class:past={day.isPast}
				role="gridcell"
				aria-label="{day.dayName}, {format(day.date, 'MMMM d, yyyy')}"
			>
				<div class="day-header">
					<div class="day-name">{day.dayName}</div>
					<div class="day-number">{day.dayNumber}</div>
					{#if day.isToday}
						<div class="today-indicator">Today</div>
					{/if}
				</div>
				
				<div class="day-meals">
					{#if day.meals.length === 0}
						<div class="empty-day">
							<p>No meals planned</p>
							<button 
								class="button button-clear"
								on:click={() => handleAddMeal(day.fullDate)}
								disabled={day.isPast}
								aria-label="Add meal for {day.dayName}"
							>
								+ Add Meal
							</button>
						</div>
					{:else}
						{#each day.meals as meal}
							<div
								class="meal-card"
								class:leftover={!meal.isOriginalDay}
								class:original={meal.isOriginalDay}
								role="button"
								tabindex="0"
								on:click={() => handleEditMeal(meal.id)}
								on:keydown={(e) => e.key === 'Enter' && handleEditMeal(meal.id)}
								aria-label="Edit {meal.recipe?.name || 'Unknown recipe'} meal"
							>
								<div class="meal-header">
									<h4>{meal.recipe?.name || 'Unknown Recipe'}</h4>
									{#if !meal.isOriginalDay}
										<span class="leftover-indicator">Leftover</span>
									{/if}
								</div>
								
								<div class="meal-details">
									{#if meal.isOriginalDay}
										<p>{meal.duration} day{meal.duration !== 1 ? 's' : ''}</p>
									{:else}
										<p>Day {meal.dayNumber} of {meal.totalDays}</p>
									{/if}
									
									{#if meal.excludedIngredients.length > 0 && meal.isOriginalDay}
										<div class="excluded-ingredients">
											<small>{meal.excludedIngredients.length} ingredient{meal.excludedIngredients.length !== 1 ? 's' : ''} excluded</small>
										</div>
									{/if}
								</div>
							</div>
						{/each}
						
						<!-- Add meal button for days with existing meals -->
						<button 
							class="button button-clear add-another"
							on:click={() => handleAddMeal(day.fullDate)}
							disabled={day.isPast}
							aria-label="Add another meal for {day.dayName}"
						>
							+ Add Another
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.meal-calendar {
		width: 100%;
	}

	.calendar-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		gap: 1rem;
	}

	.date-navigation {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.current-week {
		font-weight: 600;
		font-size: 1.6rem;
		color: #2c3e50;
		white-space: nowrap;
		min-width: 200px;
		text-align: center;
	}

	.calendar-actions {
		display: flex;
		gap: 1rem;
	}

	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 1rem;
		min-height: 400px;
	}

	.day-column {
		border: 0.1rem solid #e1e1e1;
		border-radius: 0.4rem;
		overflow: hidden;
		transition: border-color 0.2s ease;
	}

	.day-column.today {
		border-color: #9b4dca;
		box-shadow: 0 0 0 0.1rem rgba(155, 77, 202, 0.2);
	}

	.day-column.past {
		opacity: 0.7;
		background-color: #fafafa;
	}

	.day-header {
		background-color: #f4f5f6;
		padding: 1rem;
		text-align: center;
		border-bottom: 0.1rem solid #e1e1e1;
		position: relative;
	}

	.day-column.today .day-header {
		background-color: #9b4dca;
		color: white;
	}

	.day-name {
		font-weight: 600;
		color: inherit;
		font-size: 1.4rem;
	}

	.day-number {
		font-size: 1.8rem;
		font-weight: 300;
		color: inherit;
		opacity: 0.8;
	}

	.today-indicator {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		background-color: rgba(255, 255, 255, 0.2);
		padding: 0.2rem 0.5rem;
		border-radius: 0.2rem;
		font-size: 1rem;
		font-weight: 500;
	}

	.day-meals {
		padding: 1rem;
		min-height: 200px;
	}

	.empty-day {
		text-align: center;
		color: #9b9b9b;
		padding: 2rem 0;
	}

	.empty-day p {
		margin-bottom: 1rem;
		font-size: 1.4rem;
	}

	.meal-card {
		padding: 1rem;
		border-radius: 0.4rem;
		margin-bottom: 0.5rem;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 0.2rem solid transparent;
	}

	.meal-card.original {
		background-color: #9b4dca;
		color: white;
	}

	.meal-card.leftover {
		background-color: #f4f5f6;
		color: #606c76;
		border-color: #9b4dca;
		border-style: dashed;
	}

	.meal-card.original:hover {
		background-color: #8a3eb3;
		transform: translateY(-0.1rem);
	}

	.meal-card.leftover:hover {
		background-color: #e1e1e1;
		transform: translateY(-0.1rem);
	}

	.meal-card:focus {
		outline: 0.2rem solid #9b4dca;
		outline-offset: 0.2rem;
	}

	.meal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}

	.meal-card h4 {
		margin: 0;
		font-size: 1.4rem;
		line-height: 1.2;
		flex: 1;
	}

	.leftover-indicator {
		font-size: 1rem;
		padding: 0.2rem 0.5rem;
		border-radius: 0.2rem;
		background-color: rgba(155, 77, 202, 0.2);
		color: #9b4dca;
		font-weight: 600;
		white-space: nowrap;
		margin-left: 0.5rem;
	}

	.meal-card.leftover .leftover-indicator {
		background-color: #9b4dca;
		color: white;
	}

	.meal-details p {
		margin: 0;
		font-size: 1.2rem;
	}

	.meal-card.original .meal-details p {
		opacity: 0.9;
	}

	.meal-card.leftover .meal-details p {
		font-style: italic;
		color: #9b4dca;
		font-weight: 500;
	}

	.excluded-ingredients {
		margin-top: 0.5rem;
	}

	.excluded-ingredients small {
		font-size: 1rem;
		opacity: 0.8;
		font-style: italic;
	}

	.add-another {
		width: 100%;
		margin-top: 0.5rem;
		font-size: 1.2rem;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.calendar-controls {
			flex-direction: column;
			align-items: stretch;
		}

		.date-navigation {
			justify-content: center;
		}

		.calendar-actions {
			justify-content: center;
		}

		.current-week {
			min-width: auto;
		}

		.calendar-grid {
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}

		.day-column {
			min-height: auto;
		}

		.day-meals {
			min-height: auto;
			padding: 0.5rem;
		}
	}

	@media (max-width: 40rem) {
		.date-navigation {
			flex-direction: column;
			gap: 0.5rem;
		}

		.calendar-actions {
			flex-direction: column;
		}

		.calendar-actions button {
			width: 100%;
		}
	}
</style>