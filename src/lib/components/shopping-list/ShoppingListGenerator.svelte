<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { format } from 'date-fns';
	import { shoppingStore, autoGenerateShoppingList } from '$lib/stores/shopping.js';
	import type { Meal, Recipe } from '$lib/services/database.js';

	const dispatch = createEventDispatcher<{
		generated: { itemCount: number; mealCount: number };
		error: { message: string };
	}>();

	// Props
	export let disabled = false;
	export let showMealDetails = true;

	// Store subscriptions
	$: availableMeals = $autoGenerateShoppingList;
	$: isGenerating = disabled;

	// Local state
	let isWorking = false;

	async function generateList() {
		if (availableMeals.length === 0) {
			dispatch('error', { message: 'No planned meals found. Please plan some meals first.' });
			return;
		}

		isWorking = true;
		try {
			const itemCount = await shoppingStore.generateShoppingList(availableMeals);
			dispatch('generated', { itemCount, mealCount: availableMeals.length });
		} catch (error) {
			dispatch('error', { 
				message: error instanceof Error ? error.message : 'Failed to generate shopping list'
			});
		} finally {
			isWorking = false;
		}
	}

	function formatMealDate(dateStr: string): string {
		try {
			return format(new Date(dateStr), 'MMM d');
		} catch {
			return dateStr;
		}
	}
</script>

<div class="generator-container">
	<div class="generator-header">
		<h3>Generate Shopping List</h3>
		<p>Create a consolidated shopping list from your planned meals</p>
	</div>

	{#if availableMeals.length === 0}
		<div class="no-meals-message">
			<p>No planned meals found. You need to plan some meals first.</p>
			<a href="/planning" class="button button-outline">Plan Meals</a>
		</div>
	{:else}
		<div class="meals-summary">
			<h4>Meals to include ({availableMeals.length}):</h4>
			{#if showMealDetails}
				<div class="meals-list">
					{#each availableMeals.slice(0, 5) as meal}
						<div class="meal-item">
							<span class="meal-name">{meal.recipe?.name || 'Unknown Recipe'}</span>
							<span class="meal-date">{formatMealDate(meal.scheduledDate)}</span>
						</div>
					{/each}
					{#if availableMeals.length > 5}
						<div class="more-meals">
							+{availableMeals.length - 5} more meals
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="generator-actions">
			<button 
				class="button"
				on:click={generateList}
				disabled={disabled || isWorking}
			>
				{#if isWorking}
					Generating List...
				{:else}
					Generate Shopping List
				{/if}
			</button>
		</div>
	{/if}
</div>

<style>
	.generator-container {
		background: white;
		border: 0.1rem solid #e1e1e1;
		border-radius: 0.4rem;
		padding: 2rem;
		margin-bottom: 2rem;
	}

	.generator-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.generator-header h3 {
		margin-bottom: 0.5rem;
		color: #2c3e50;
	}

	.generator-header p {
		color: #606c76;
		font-size: 1.4rem;
	}

	.no-meals-message {
		text-align: center;
		padding: 2rem;
		color: #606c76;
	}

	.no-meals-message p {
		margin-bottom: 1.5rem;
	}

	.meals-summary h4 {
		margin-bottom: 1rem;
		color: #2c3e50;
		font-size: 1.4rem;
	}

	.meals-list {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		margin-bottom: 1.5rem;
	}

	.meal-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.8rem;
		background: #f8f9fa;
		border-radius: 0.3rem;
		border: 0.1rem solid #e1e1e1;
	}

	.meal-name {
		font-weight: 600;
		color: #2c3e50;
	}

	.meal-date {
		font-size: 1.2rem;
		color: #9b4dca;
		font-weight: 600;
	}

	.more-meals {
		text-align: center;
		padding: 0.8rem;
		color: #606c76;
		font-style: italic;
	}

	.generator-actions {
		text-align: center;
	}

	.generator-actions button {
		min-width: 200px;
	}

	/* Responsive design */
	@media (max-width: 40rem) {
		.generator-container {
			padding: 1.5rem;
		}
		
		.meal-item {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}
	}
</style>