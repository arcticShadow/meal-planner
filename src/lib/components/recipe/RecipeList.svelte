<script lang="ts">
	import type { Recipe } from '../../services/database.js';
	import RecipeCard from './RecipeCard.svelte';
	import { createEventDispatcher } from 'svelte';

	export let recipes: Recipe[] = [];
	export let loading = false;
	export let error: string | null = null;
	export let searchQuery = '';
	export let selectedCategory = '';
	export let selectedTags: string[] = [];
	export let availableCategories: string[] = [];
	export let availableTags: string[] = [];
	export let showFilters = true;
	export let showSearch = true;
	export let compact = false;

	const dispatch = createEventDispatcher<{
		search: string;
		categoryChange: string;
		tagChange: string[];
		clearFilters: void;
		edit: Recipe;
		delete: Recipe;
		select: Recipe;
		add: void;
	}>();

	// Pagination
	let currentPage = 1;
	let itemsPerPage = 12;
	
	$: totalPages = Math.ceil(recipes.length / itemsPerPage);
	$: paginatedRecipes = recipes.slice(
		(currentPage - 1) * itemsPerPage,
		currentPage * itemsPerPage
	);

	// Filter state
	let showFilterPanel = false;

	function handleSearch(event: Event) {
		const target = event.target as HTMLInputElement;
		dispatch('search', target.value);
		currentPage = 1; // Reset to first page when searching
	}

	function handleCategoryChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		dispatch('categoryChange', target.value);
		currentPage = 1;
	}

	function handleTagToggle(tag: string) {
		const newTags = selectedTags.includes(tag)
			? selectedTags.filter(t => t !== tag)
			: [...selectedTags, tag];
		dispatch('tagChange', newTags);
		currentPage = 1;
	}

	function clearAllFilters() {
		dispatch('clearFilters');
		currentPage = 1;
	}

	function goToPage(page: number) {
		currentPage = Math.max(1, Math.min(page, totalPages));
	}

	function handleEdit(event: CustomEvent<Recipe>) {
		dispatch('edit', event.detail);
	}

	function handleDelete(event: CustomEvent<Recipe>) {
		dispatch('delete', event.detail);
	}

	function handleSelect(event: CustomEvent<Recipe>) {
		dispatch('select', event.detail);
	}

	// Reset page when recipes change
	$: if (recipes) {
		currentPage = Math.min(currentPage, totalPages || 1);
	}
</script>

<div>
	<!-- Header -->
	<header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3rem;">
		<div style="display: flex; align-items: center; gap: 1rem;">
			<h2>Recipe Library</h2>
			<span class="badge badge-secondary">
				{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
			</span>
		</div>
		<button class="button" on:click={() => dispatch('add')}>
			Add Recipe
		</button>
	</header>

	<!-- Search and Filters -->
	{#if showSearch || showFilters}
		<div style="display: flex; gap: 1rem; margin-bottom: 2rem; align-items: center;">
			{#if showSearch}
				<div style="position: relative; flex: 1; max-width: 40rem;">
					<input
						type="text"
						placeholder="Search recipes, ingredients, or tags..."
						value={searchQuery}
						on:input={handleSearch}
						style="padding-left: 4rem;"
					/>
					<svg style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #9b9b9b;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="11" cy="11" r="8"/>
						<path d="m21 21-4.35-4.35"/>
					</svg>
				</div>
			{/if}

			{#if showFilters}
				<div style="display: flex; gap: 1rem; align-items: center;">
					<button
						class="button button-outline"
						class:active={showFilterPanel}
						on:click={() => showFilterPanel = !showFilterPanel}
						style={showFilterPanel ? 'background-color: #9b4dca; color: #fff;' : ''}
					>
						Filters
						{#if selectedCategory || selectedTags.length > 0}
							<span class="badge">{(selectedCategory ? 1 : 0) + selectedTags.length}</span>
						{/if}
					</button>

					{#if selectedCategory || selectedTags.length > 0}
						<button class="button button-outline" on:click={clearAllFilters}>
							Clear All
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Filter Panel -->
		{#if showFilterPanel && showFilters}
			<div style="background: #f4f5f6; border: 0.1rem solid #d1d1d1; border-radius: 0.4rem; padding: 2rem; margin-bottom: 2rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(25rem, 1fr)); gap: 2rem;">
				<div>
					<label for="category-filter">Category</label>
					<select
						id="category-filter"
						value={selectedCategory}
						on:change={handleCategoryChange}
					>
						<option value="">All Categories</option>
						{#each availableCategories as category}
							<option value={category}>{category}</option>
						{/each}
					</select>
				</div>

				{#if availableTags.length > 0}
					<div>
						<label>Tags</label>
						<div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
							{#each availableTags as tag}
								<button
									class="button button-outline"
									style={selectedTags.includes(tag) ? 'background: #9b4dca; border-color: #9b4dca; color: white;' : ''}
									on:click={() => handleTagToggle(tag)}
								>
									{tag}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{/if}

	<!-- Active Filters Display -->
	{#if selectedCategory || selectedTags.length > 0}
		<div class="alert alert-warning" style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;">
			<strong>Active filters:</strong>
			{#if selectedCategory}
				<span class="badge badge-warning">
					Category: {selectedCategory}
					<button style="background: none; border: none; color: inherit; margin-left: 0.5rem;" on:click={() => dispatch('categoryChange', '')}>×</button>
				</span>
			{/if}
			{#each selectedTags as tag}
				<span class="badge badge-warning">
					{tag}
					<button style="background: none; border: none; color: inherit; margin-left: 0.5rem;" on:click={() => handleTagToggle(tag)}>×</button>
				</span>
			{/each}
		</div>
	{/if}

	<!-- Loading State -->
	{#if loading}
		<div style="text-align: center; padding: 4rem 2rem;">
			<div class="loading"></div>
			<p>Loading recipes...</p>
		</div>
	{/if}

	<!-- Error State -->
	{#if error}
		<div class="alert alert-error">
			<p>Error: {error}</p>
		</div>
	{/if}

	<!-- Empty State -->
	{#if !loading && !error && recipes.length === 0}
		<div style="text-align: center; padding: 4rem 2rem;">
			<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="color: #9b9b9b; margin-bottom: 2rem;">
				<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
				<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
				<path d="M12 11h4"/>
				<path d="M12 16h4"/>
				<path d="M8 11h.01"/>
				<path d="M8 16h.01"/>
			</svg>
			<h3>No recipes found</h3>
			<p>
				{#if searchQuery || selectedCategory || selectedTags.length > 0}
					Try adjusting your search or filters, or add a new recipe.
				{:else}
					Get started by adding your first recipe!
				{/if}
			</p>
			<button class="button" on:click={() => dispatch('add')}>
				Add Your First Recipe
			</button>
		</div>
	{/if}

	<!-- Recipe Grid -->
	{#if !loading && !error && paginatedRecipes.length > 0}
		<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(35rem, 1fr)); gap: 2rem; margin-bottom: 3rem;">
			{#each paginatedRecipes as recipe (recipe.id)}
				<RecipeCard
					{recipe}
					{compact}
					on:edit={handleEdit}
					on:delete={handleDelete}
					on:select={handleSelect}
				/>
			{/each}
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<nav style="display: flex; justify-content: center; align-items: center; gap: 1rem; margin-bottom: 2rem;">
				<button
					class="button button-outline"
					disabled={currentPage === 1}
					on:click={() => goToPage(currentPage - 1)}
				>
					Previous
				</button>

				<div style="display: flex; gap: 0.5rem;">
					{#each Array(totalPages) as _, i}
						{@const page = i + 1}
						{#if page === 1 || page === totalPages || (page >= currentPage - 2 && page <= currentPage + 2)}
							<button
								class="button {page === currentPage ? '' : 'button-outline'}"
								on:click={() => goToPage(page)}
							>
								{page}
							</button>
						{:else if page === currentPage - 3 || page === currentPage + 3}
							<span style="padding: 0 0.5rem; color: #606c76; line-height: 3.8rem;">...</span>
						{/if}
					{/each}
				</div>

				<button
					class="button button-outline"
					disabled={currentPage === totalPages}
					on:click={() => goToPage(currentPage + 1)}
				>
					Next
				</button>
			</nav>

			<p style="text-align: center; color: #606c76;">
				Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, recipes.length)} of {recipes.length} recipes
			</p>
		{/if}
	{/if}
</div>

<style>
	/* Responsive design */
	@media (max-width: 40rem) {
		header {
			flex-direction: column !important;
			gap: 2rem !important;
			align-items: stretch !important;
		}
	}
</style>