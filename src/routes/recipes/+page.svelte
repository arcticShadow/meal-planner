<script lang="ts">
	import { onMount } from 'svelte';
	import type { Recipe } from '$lib/services/database.js';
	import { recipeStore, filteredRecipes, recipeCategories, recipeTags } from '$lib/stores/recipes.js';
	import RecipeList from '$lib/components/recipe/RecipeList.svelte';
	import RecipeForm from '$lib/components/recipe/RecipeForm.svelte';
	import RecipeCard from '$lib/components/recipe/RecipeCard.svelte';

	// Component state
	let currentView: 'list' | 'form' | 'detail' = 'list';
	let editingRecipe: Recipe | null = null;
	let selectedRecipe: Recipe | null = null;
	let showImportDialog = false;
	let importFile: FileList | null = null;
	let importError = '';
	let importSuccess = '';

	// Subscribe to stores
	$: recipes = $filteredRecipes;
	$: categories = $recipeCategories;
	$: tags = $recipeTags;
	$: loading = $recipeStore.loading;
	$: error = $recipeStore.error;
	$: searchQuery = $recipeStore.searchQuery;
	$: selectedCategory = $recipeStore.selectedCategory;
	$: selectedTags = $recipeStore.selectedTags;

	// Load recipes on mount
	onMount(() => {
		recipeStore.loadRecipes();
	});

	// Event handlers
	function handleAddRecipe() {
		editingRecipe = null;
		currentView = 'form';
	}

	function handleEditRecipe(event: CustomEvent<Recipe>) {
		editingRecipe = event.detail;
		currentView = 'form';
	}

	async function handleDeleteRecipe(event: CustomEvent<Recipe>) {
		const recipe = event.detail;
		if (confirm(`Are you sure you want to delete "${recipe.name}"? This action cannot be undone.`)) {
			try {
				await recipeStore.deleteRecipe(recipe.id!);
			} catch (err) {
				console.error('Failed to delete recipe:', err);
			}
		}
	}

	function handleSelectRecipe(event: CustomEvent<Recipe>) {
		selectedRecipe = event.detail;
		currentView = 'detail';
	}

	async function handleSaveRecipe(event: CustomEvent<Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>>) {
		try {
			if (editingRecipe) {
				await recipeStore.updateRecipe(editingRecipe.id!, event.detail);
			} else {
				await recipeStore.addRecipe(event.detail);
			}
			currentView = 'list';
			editingRecipe = null;
		} catch (err) {
			console.error('Failed to save recipe:', err);
		}
	}

	function handleCancelForm() {
		currentView = 'list';
		editingRecipe = null;
	}

	function handleBackToList() {
		currentView = 'list';
		selectedRecipe = null;
	}

	// Search and filter handlers
	function handleSearch(event: CustomEvent<string>) {
		recipeStore.setSearchQuery(event.detail);
	}

	function handleCategoryChange(event: CustomEvent<string>) {
		recipeStore.setSelectedCategory(event.detail);
	}

	function handleTagChange(event: CustomEvent<string[]>) {
		recipeStore.setSelectedTags(event.detail);
	}

	function handleClearFilters() {
		recipeStore.clearFilters();
	}

	// Import functionality
	function handleImportClick() {
		showImportDialog = true;
		importError = '';
		importSuccess = '';
	}

	function handleImportCancel() {
		showImportDialog = false;
		importFile = null;
		importError = '';
		importSuccess = '';
	}

	async function handleImportConfirm() {
		if (!importFile || importFile.length === 0) {
			importError = 'Please select a file to import';
			return;
		}

		const file = importFile[0];
		if (!file.name.endsWith('.json')) {
			importError = 'Please select a JSON file';
			return;
		}

		try {
			const text = await file.text();
			const result = await recipeStore.importRecipes(text);
			importSuccess = `Successfully imported ${result.imported} recipes${result.errors > 0 ? ` with ${result.errors} errors` : ''}`;
			
			if (result.errors === 0) {
				setTimeout(() => {
					handleImportCancel();
				}, 2000);
			}
		} catch (err) {
			importError = err instanceof Error ? err.message : 'Failed to import recipes';
		}
	}

	// Export functionality
	async function handleExport() {
		try {
			const recipes = $recipeStore.recipes;
			const exportData = {
				version: 1,
				exportDate: new Date().toISOString(),
				recipes: recipes
			};

			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `recipes-export-${new Date().toISOString().split('T')[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Failed to export recipes:', err);
		}
	}

	// Clear error when it changes
	$: if (error) {
		setTimeout(() => {
			recipeStore.clearError();
		}, 5000);
	}
</script>

<svelte:head>
	<title>Recipe Library - Menu Planner</title>
</svelte:head>

<!-- Error Display -->
{#if error}
	<div class="error-banner">
		<p>{error}</p>
		<button on:click={() => recipeStore.clearError()}>×</button>
	</div>
{/if}

<!-- Main Content -->
{#if currentView === 'list'}
	<RecipeList
		{recipes}
		{loading}
		error={null}
		{searchQuery}
		{selectedCategory}
		{selectedTags}
		availableCategories={categories}
		availableTags={tags}
		on:search={handleSearch}
		on:categoryChange={handleCategoryChange}
		on:tagChange={handleTagChange}
		on:clearFilters={handleClearFilters}
		on:add={handleAddRecipe}
		on:edit={handleEditRecipe}
		on:delete={handleDeleteRecipe}
		on:select={handleSelectRecipe}
	/>

	<!-- Additional Actions -->
	<div class="additional-actions">
		<button class="btn btn-outline" on:click={handleImportClick}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
				<polyline points="14,2 14,8 20,8"/>
				<line x1="16" y1="13" x2="8" y2="13"/>
				<line x1="16" y1="17" x2="8" y2="17"/>
				<polyline points="10,9 9,9 8,9"/>
			</svg>
			Import from JSON
		</button>
		
		{#if recipes.length > 0}
			<button class="btn btn-outline" on:click={handleExport}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
					<polyline points="14,2 14,8 20,8"/>
					<line x1="16" y1="13" x2="8" y2="13"/>
					<line x1="16" y1="17" x2="8" y2="17"/>
					<polyline points="10,9 9,9 8,9"/>
				</svg>
				Export Recipes
			</button>
		{/if}
	</div>

{:else if currentView === 'form'}
	<div class="form-container">
		<RecipeForm
			recipe={editingRecipe}
			isEditing={!!editingRecipe}
			on:save={handleSaveRecipe}
			on:cancel={handleCancelForm}
		/>
	</div>

{:else if currentView === 'detail' && selectedRecipe}
	<div class="detail-container">
		<div class="detail-header">
			<button class="btn btn-outline" on:click={handleBackToList}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="15,18 9,12 15,6"/>
				</svg>
				Back to Library
			</button>
		</div>

		<article>
			<RecipeCard
				recipe={selectedRecipe}
				showActions={true}
				compact={false}
				on:edit={handleEditRecipe}
				on:delete={handleDeleteRecipe}
			/>

			<!-- Detailed Recipe View -->
			<div style="display: grid; gap: 3rem;">
				<section>
					<h3>Ingredients</h3>
					<ul style="list-style: none; padding: 0; margin: 0;">
						{#each selectedRecipe.ingredients as ingredient}
							<li style="display: flex; align-items: center; gap: 1rem; padding: 1rem 0; border-bottom: 0.1rem solid #f4f5f6; {ingredient.optional ? 'opacity: 0.7;' : ''}">
								<strong style="color: #9b4dca; min-width: 6rem;">{ingredient.quantity} {ingredient.unit}</strong>
								<span style="flex: 1; color: #606c76;">{ingredient.name}</span>
								{#if ingredient.optional}
									<small style="color: #9b9b9b; font-style: italic;">(optional)</small>
								{/if}
							</li>
						{/each}
					</ul>
				</section>

				<section>
					<h3>Instructions</h3>
					<ol style="list-style: none; padding: 0; margin: 0;">
						{#each selectedRecipe.instructions as instruction, index}
							<li style="display: flex; gap: 2rem; padding: 2rem 0; border-bottom: 0.1rem solid #f4f5f6;">
								<span style="background: #9b4dca; color: white; width: 3rem; height: 3rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; flex-shrink: 0;">{index + 1}</span>
								<span style="flex: 1; line-height: 1.6; color: #606c76;">{instruction}</span>
							</li>
						{/each}
					</ol>
				</section>
			</div>
		</article>
	</div>
{/if}

<!-- Import Dialog -->
{#if showImportDialog}
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby="import-dialog-title"
		tabindex="-1"
		style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;"
		on:click={handleImportCancel}
		on:keydown={(e) => e.key === 'Escape' && handleImportCancel()}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			role="document"
			style="background: white; border-radius: 0.4rem; max-width: 50rem; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.2);"
			on:click|stopPropagation
		>
			<header style="display: flex; justify-content: space-between; align-items: center; padding: 2rem; border-bottom: 0.1rem solid #e1e1e1;">
				<h3 id="import-dialog-title" style="margin: 0;">Import Recipes from JSON</h3>
				<button style="background: none; border: none; font-size: 2rem; cursor: pointer; color: #9b9b9b; padding: 0; width: 3rem; height: 3rem; display: flex; align-items: center; justify-content: center;" on:click={handleImportCancel}>×</button>
			</header>

			<div style="padding: 2rem;">
				<p>Select a JSON file containing recipes to import into your library.</p>
				
				<div style="position: relative; margin-bottom: 2rem;">
					<input
						type="file"
						accept=".json"
						bind:files={importFile}
						id="import-file"
						style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer;"
					/>
					<label for="import-file" style="display: block; padding: 2rem; border: 0.2rem dashed #d1d1d1; border-radius: 0.4rem; text-align: center; cursor: pointer; transition: all 0.2s ease; color: #606c76;">
						{importFile && importFile.length > 0 ? importFile[0].name : 'Choose JSON file...'}
					</label>
				</div>

				{#if importError}
					<div class="alert alert-error">{importError}</div>
				{/if}

				{#if importSuccess}
					<div class="alert alert-success">{importSuccess}</div>
				{/if}
			</div>

			<footer style="display: flex; gap: 2rem; justify-content: flex-end; padding: 2rem; border-top: 0.1rem solid #e1e1e1;">
				<button class="button button-outline" on:click={handleImportCancel}>Cancel</button>
				<button class="button" on:click={handleImportConfirm} disabled={!importFile || importFile.length === 0}>
					Import Recipes
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.error-banner {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.error-banner button {
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		font-size: 2rem;
		padding: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.additional-actions {
		display: flex;
		gap: 2rem;
		justify-content: center;
		margin-top: 3rem;
		padding-top: 3rem;
		border-top: 0.1rem solid #e1e1e1;
	}

	/* Responsive design */
	@media (max-width: 40rem) {
		.additional-actions {
			flex-direction: column;
			align-items: center;
		}
	}
</style>