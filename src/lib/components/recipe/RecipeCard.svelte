<script lang="ts">
	import type { Recipe } from '../../services/database.js';
	import { createEventDispatcher } from 'svelte';

	export let recipe: Recipe;
	export let showActions = true;
	export let compact = false;

	const dispatch = createEventDispatcher<{
		edit: Recipe;
		delete: Recipe;
		select: Recipe;
	}>();

	function formatTime(minutes: number | undefined): string {
		if (!minutes) return '';
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}

	function getTotalTime(): string {
		const prep = recipe.prepTime || 0;
		const cook = recipe.cookTime || 0;
		const total = prep + cook;
		return total > 0 ? formatTime(total) : '';
	}
</script>

<div class="card">
	<!-- Recipe Image Teaser -->
	{#if recipe.images && recipe.images.length > 0 && recipe.images[0].src}
		<div class="recipe-image-container">
			<img
				src={recipe.images[0].src}
				alt={recipe.name}
				class="recipe-teaser-image"
				on:error={(e) => {
					// Hide image if it fails to load
					const target = e.target as HTMLImageElement;
					if (target) {
						target.style.display = 'none';
					}
				}}
			/>
		</div>
	{/if}

	<header class="card-header">
		<h5 class="card-title" on:click={() => dispatch('select', recipe)} on:keydown={(e) => e.key === 'Enter' && dispatch('select', recipe)} tabindex="0" role="button" style="cursor: pointer; margin-bottom: 0;">
			{recipe.name}
		</h5>
		{#if showActions}
			<div style="display: flex; gap: 0.5rem;">
				<button class="button button-outline" on:click={() => dispatch('edit', recipe)} title="Edit recipe">
					Edit
				</button>
				<button class="button button-outline" on:click={() => dispatch('delete', recipe)} title="Delete recipe" style="background-color: #e85600; border-color: #e85600; color: white;">
					Delete
				</button>
			</div>
		{/if}
	</header>

	<div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.5rem;">
		{#if recipe.category}
			<span class="badge">{recipe.category}</span>
		{/if}
		<span class="badge badge-secondary">{recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}</span>
		{#if getTotalTime()}
			<span class="badge badge-secondary">{getTotalTime()}</span>
		{/if}
		<span class="badge badge-secondary">{recipe.defaultDuration} day{recipe.defaultDuration !== 1 ? 's' : ''}</span>
	</div>

	{#if !compact}
		<p>{recipe.description}</p>

		{#if recipe.tags.length > 0}
			<div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.5rem;">
				{#each recipe.tags as tag}
					<span class="badge badge-secondary">{tag}</span>
				{/each}
			</div>
		{/if}

		<footer style="border-top: 0.1rem solid #e1e1e1; padding-top: 1rem; margin-top: 1rem;">
			<small>
				{recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''} •
				{recipe.instructions.length} step{recipe.instructions.length !== 1 ? 's' : ''}
			</small>
		</footer>
	{/if}
</div>

<style>
	.recipe-image-container {
		width: 100%;
		height: 200px;
		overflow: hidden;
		border-radius: 0.4rem 0.4rem 0 0;
		margin: -1.5rem -1.5rem 1.5rem -1.5rem;
	}

	.recipe-teaser-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}

	.card-title:hover {
		color: #9b4dca;
	}

	.card-title:focus {
		outline: 0.2rem solid #9b4dca;
		outline-offset: 0.2rem;
	}

	/* Responsive design */
	@media (max-width: 40rem) {
		.card-header {
			flex-direction: column;
			gap: 1rem;
		}
		
		.recipe-image-container {
			height: 150px;
		}
	}
</style>