<script lang="ts">
	import { format, addDays } from 'date-fns';
	import { mealStore, availableDates } from '../../stores/meals.js';
	import { recipeStore, filteredRecipes } from '../../stores/recipes.js';
	import { createEventDispatcher, onMount } from 'svelte';
	import { DatabaseService, type Recipe, type Ingredient } from '../../services/database.js';
	import { COMMON_UNITS } from '../../utils/validators.js';

	export let selectedDate: string = '';
	export let selectedRecipe: Recipe | null = null;
	export let editingMealId: string | null = null;
	export let isOpen: boolean = false;

	const dispatch = createEventDispatcher<{
		close: void;
		mealScheduled: { mealId: string; date: string };
	}>();

	// Form state
	let duration = 2; // Default 2 days
	let excludedIngredients: string[] = [];
	let includedIngredients: Set<string> = new Set();
	let ingredientSubstitutions: Record<string, Ingredient> = {};
	let loading = false;
	let error = '';
	
	// Substitution UI state
	let editingSubstitution: string | null = null;
	let substitutionForm = {
		name: '',
		quantity: 0,
		unit: ''
	};

	// Recipe selection
	let recipeSearchQuery = '';
	let showRecipeDropdown = false;
	let recipeSearchInput: HTMLInputElement;

	// Date selection 
	let showDateDropdown = false;
	let suggestedDate = '';

	$: filteredRecipesForSearch = $filteredRecipes.filter(recipe =>
		recipeSearchQuery ? recipe.name.toLowerCase().includes(recipeSearchQuery.toLowerCase()) : true
	);

	$: availableIngredients = selectedRecipe?.ingredients.map(ing => ing.name) || [];
	
	// Initialize included ingredients when recipe changes
	$: if (selectedRecipe) {
		initializeIncludedIngredients();
	}
	
	function initializeIncludedIngredients() {
		if (!selectedRecipe) return;
		
		// Start with all ingredients included
		includedIngredients = new Set(selectedRecipe.ingredients.map(ing => ing.name));
		
		// Remove any previously excluded ingredients
		excludedIngredients.forEach(ingredient => {
			includedIngredients.delete(ingredient);
		});
	}
	
	function toggleIngredient(ingredient: string, included: boolean) {
		if (included) {
			includedIngredients.add(ingredient);
			excludedIngredients = excludedIngredients.filter(ing => ing !== ingredient);
		} else {
			includedIngredients.delete(ingredient);
			if (!excludedIngredients.includes(ingredient)) {
				excludedIngredients = [...excludedIngredients, ingredient];
			}
		}
		// Trigger reactivity
		includedIngredients = new Set(includedIngredients);
	}

	// Load suggested date when component opens
	$: if (isOpen && !selectedDate) {
		loadSuggestedDate();
	}

	async function loadSuggestedDate() {
		try {
			suggestedDate = await mealStore.findNextAvailableDate();
			if (!selectedDate) {
				selectedDate = suggestedDate;
			}
		} catch (error) {
			console.error('Error loading suggested date:', error);
		}
	}

	// Substitution functions
	function startSubstitution(ingredientName: string) {
		const originalIngredient = selectedRecipe?.ingredients.find(ing => ing.name === ingredientName);
		if (!originalIngredient) return;

		editingSubstitution = ingredientName;
		const existingSubstitution = ingredientSubstitutions[ingredientName];
		
		if (existingSubstitution) {
			substitutionForm = {
				name: existingSubstitution.name,
				quantity: existingSubstitution.quantity,
				unit: existingSubstitution.unit
			};
		} else {
			substitutionForm = {
				name: originalIngredient.name,
				quantity: originalIngredient.quantity,
				unit: originalIngredient.unit
			};
		}
	}

	function saveSubstitution() {
		if (!editingSubstitution || !substitutionForm.name.trim()) return;

		ingredientSubstitutions[editingSubstitution] = {
			name: substitutionForm.name.trim(),
			quantity: substitutionForm.quantity,
			unit: substitutionForm.unit.trim()
		};
		
		editingSubstitution = null;
		substitutionForm = { name: '', quantity: 0, unit: '' };
		
		// Trigger reactivity
		ingredientSubstitutions = { ...ingredientSubstitutions };
	}

	function cancelSubstitution() {
		editingSubstitution = null;
		substitutionForm = { name: '', quantity: 0, unit: '' };
	}

	function removeSubstitution(ingredientName: string) {
		delete ingredientSubstitutions[ingredientName];
		ingredientSubstitutions = { ...ingredientSubstitutions };
	}

	function handleRecipeSearch(event: Event) {
		const target = event.target as HTMLInputElement;
		recipeSearchQuery = target.value;
		showRecipeDropdown = recipeSearchQuery.length > 0;
	}

	function selectRecipe(recipe: Recipe) {
		selectedRecipe = recipe;
		recipeSearchQuery = recipe.name;
		showRecipeDropdown = false;
		excludedIngredients = []; // Reset excluded ingredients when recipe changes
	}

	async function handleSubmit() {
		if (!selectedRecipe || !selectedDate) {
			error = 'Please select both a recipe and date';
			return;
		}

		if (duration < 1 || duration > 14) {
			error = 'Duration must be between 1 and 14 days';
			return;
		}

		loading = true;
		error = '';

		try {
			if (!selectedRecipe.id) {
				error = 'Invalid recipe selected';
				return;
			}

			const mealData = {
				recipeId: selectedRecipe.id,
				scheduledDate: selectedDate,
				duration,
				excludedIngredients,
				ingredientSubstitutions
			};

			let mealId: string;

			if (editingMealId) {
				await mealStore.updateMeal(editingMealId, mealData);
				mealId = editingMealId;
			} else {
				mealId = await mealStore.addMeal(mealData);
			}

			dispatch('mealScheduled', { mealId, date: selectedDate });
			resetForm();
			close();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to schedule meal';
		} finally {
			loading = false;
		}
	}

	function resetForm() {
		selectedRecipe = null;
		selectedDate = '';
		duration = 2;
		excludedIngredients = [];
		includedIngredients = new Set();
		ingredientSubstitutions = {};
		editingSubstitution = null;
		substitutionForm = { name: '', quantity: 0, unit: '' };
		recipeSearchQuery = '';
		showRecipeDropdown = false;
		showDateDropdown = false;
		error = '';
		editingMealId = null;
	}

	function close() {
		resetForm();
		dispatch('close');
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			close();
		}
	}

	onMount(() => {
		// Load recipes when component mounts
		recipeStore.loadRecipes();
	});

	// Load existing meal data when editing
	$: if (isOpen && editingMealId) {
		loadExistingMeal();
	}

	async function loadExistingMeal() {
		if (!editingMealId) return;
		
		try {
			const meal = await DatabaseService.getMeal(editingMealId);
			if (meal) {
				selectedDate = meal.scheduledDate;
				duration = meal.duration;
				excludedIngredients = meal.excludedIngredients || [];
				ingredientSubstitutions = meal.ingredientSubstitutions || {};
				
				// Load the recipe
				const recipe = await DatabaseService.getRecipe(meal.recipeId);
				if (recipe) {
					selectedRecipe = recipe;
					recipeSearchQuery = recipe.name;
					initializeIncludedIngredients();
				}
			}
		} catch (error) {
			console.error('Error loading existing meal:', error);
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<div
		class="scheduler-overlay"
		on:click={close}
		on:keydown={(e) => e.key === 'Escape' && close()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="scheduler-title"
		tabindex="-1"
	>
		<div
			class="scheduler-modal"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="document"
		>
			<div class="scheduler-header">
				<h2 id="scheduler-title">
					{editingMealId ? 'Edit' : 'Schedule'} Meal
				</h2>
				<button 
					class="close-button"
					on:click={close}
					aria-label="Close scheduler"
				>
					×
				</button>
			</div>

			<form on:submit|preventDefault={handleSubmit} class="scheduler-form">
				{#if error}
					<div class="alert alert-error" role="alert">
						{error}
					</div>
				{/if}

				<!-- Recipe Selection -->
				<fieldset>
					<legend>Recipe Selection</legend>
					<div class="form-group">
						<label for="recipe-search">Search and Select Recipe *</label>
						<div class="recipe-selector">
							<input
								id="recipe-search"
								type="text"
								bind:this={recipeSearchInput}
								bind:value={recipeSearchQuery}
								on:input={handleRecipeSearch}
								on:focus={() => showRecipeDropdown = recipeSearchQuery.length > 0}
								placeholder="Type to search recipes..."
								required
								aria-haspopup="listbox"
								aria-describedby="recipe-search-help"
							>
							<small id="recipe-search-help" class="sr-only">
								Type to search and select a recipe from the dropdown
							</small>
							
							{#if showRecipeDropdown && filteredRecipesForSearch.length > 0}
								<div class="recipe-dropdown" role="listbox">
									{#each filteredRecipesForSearch.slice(0, 5) as recipe}
										<button
											type="button"
											class="recipe-option"
											on:click={() => selectRecipe(recipe)}
											role="option"
											aria-selected={selectedRecipe?.id === recipe.id}
										>
											<div class="recipe-name">{recipe.name}</div>
											<div class="recipe-meta">
												{recipe.servings} servings • {recipe.ingredients.length} ingredients
											</div>
										</button>
									{/each}
								</div>
							{/if}
						</div>
						
						{#if selectedRecipe}
							<div class="selected-recipe">
								<strong>Selected:</strong> {selectedRecipe.name}
								<small>({selectedRecipe.servings} servings, {selectedRecipe.ingredients.length} ingredients)</small>
							</div>
						{/if}
					</div>
				</fieldset>

				<!-- Date Selection -->
				<fieldset>
					<legend>Date & Duration</legend>
					<div class="form-row">
						<div class="form-group">
							<label for="scheduled-date">Scheduled Date *</label>
							<input
								id="scheduled-date"
								type="date"
								bind:value={selectedDate}
								min={format(new Date(), 'yyyy-MM-dd')}
								required
							>
							{#if suggestedDate && selectedDate !== suggestedDate}
								<button
									type="button"
									class="button button-outline button-small"
									on:click={() => selectedDate = suggestedDate}
									style="margin-top: 0.5rem; font-size: 1.2rem;"
								>
									Use suggested date ({format(new Date(suggestedDate), 'MMM d')})
								</button>
							{/if}
						</div>
						
						<div class="form-group">
							<label for="duration">Duration (days) *</label>
							<input
								id="duration"
								type="number"
								bind:value={duration}
								min="1"
								max="14"
								required
								aria-describedby="duration-help"
							>
							<small id="duration-help">How many days this meal will last (1-14)</small>
						</div>
					</div>
				</fieldset>

				<!-- Shopping List Ingredients -->
				{#if selectedRecipe && selectedRecipe.ingredients.length > 0}
					<fieldset>
						<legend>Shopping List Ingredients</legend>
						<p class="field-description">
							Select which ingredients to include in your shopping list. Uncheck items you already have.
						</p>

						<!-- Ingredient Reference Image -->
						{#if selectedRecipe.images && selectedRecipe.images.length > 0}
							<div class="ingredient-reference-image">
								<h4>Ingredient Reference</h4>
								<p class="image-caption">
									{#if selectedRecipe.images.length > 1}
										Original ingredient list for verification:
									{:else}
										Recipe image for reference:
									{/if}
								</p>
								<img
									src={selectedRecipe.images.length > 1 ? selectedRecipe.images[1].src : selectedRecipe.images[0].src}
									alt="{selectedRecipe.name} - Ingredient reference"
									class="reference-image"
									on:error={(e) => {
										const target = e.target as HTMLImageElement;
										if (target) {
											target.style.display = 'none';
										}
									}}
								/>
							</div>
						{/if}
						
						<div class="ingredients-checklist">
							{#each selectedRecipe.ingredients as ingredient}
								<div class="ingredient-item">
									<label class="ingredient-checkbox">
										<input
											type="checkbox"
											checked={includedIngredients.has(ingredient.name)}
											on:change={(e) => toggleIngredient(ingredient.name, e.currentTarget.checked)}
										>
										<span class="ingredient-details">
											{#if ingredientSubstitutions[ingredient.name]}
												<span class="ingredient-name substituted">
													{ingredientSubstitutions[ingredient.name].name}
													<small class="substitution-indicator">(swapped)</small>
												</span>
												<span class="ingredient-amount">
													{ingredientSubstitutions[ingredient.name].quantity} {ingredientSubstitutions[ingredient.name].unit}
												</span>
											{:else}
												<span class="ingredient-name">{ingredient.name}</span>
												<span class="ingredient-amount">
													{ingredient.quantity} {ingredient.unit}
												</span>
											{/if}
										</span>
									</label>
									
									<!-- Inline swap button -->
									{#if editingSubstitution !== ingredient.name}
										<button
											type="button"
											class="swap-icon-button"
											on:click={() => startSubstitution(ingredient.name)}
											title={ingredientSubstitutions[ingredient.name] ? 'Edit substitution' : 'Swap ingredient'}
											aria-label={ingredientSubstitutions[ingredient.name] ? 'Edit substitution' : 'Swap ingredient'}
										>
											⇄
										</button>
										{#if ingredientSubstitutions[ingredient.name]}
											<button
												type="button"
												class="reset-icon-button"
												on:click={() => removeSubstitution(ingredient.name)}
												title="Remove substitution"
												aria-label="Remove substitution"
											>
												↺
											</button>
										{/if}
									{/if}
								</div>

								<!-- Substitution form (shown below ingredient when editing) -->
								{#if editingSubstitution === ingredient.name}
									<fieldset class="substitution-form">
										<legend>Substitute Ingredient</legend>
										<div class="substitution-inputs">
											<div class="substitution-field">
												<label for="substitute-name-{ingredient.name}">Name</label>
												<input
													id="substitute-name-{ingredient.name}"
													type="text"
													bind:value={substitutionForm.name}
													placeholder="Ingredient name"
													class="substitution-input"
												/>
											</div>
											<div class="substitution-field">
												<label for="substitute-quantity-{ingredient.name}">Quantity</label>
												<input
													id="substitute-quantity-{ingredient.name}"
													type="number"
													bind:value={substitutionForm.quantity}
													min="0"
													step="0.1"
													class="substitution-input"
												/>
											</div>
											<div class="substitution-field">
												<label for="substitute-unit-{ingredient.name}">Unit</label>
												<select
													id="substitute-unit-{ingredient.name}"
													bind:value={substitutionForm.unit}
													class="substitution-input"
												>
													{#each COMMON_UNITS as unit}
														<option value={unit}>{unit}</option>
													{/each}
												</select>
											</div>
										</div>
										<div class="substitution-actions">
											<button
												type="button"
												class="button button-small"
												on:click={saveSubstitution}
												disabled={!substitutionForm.name.trim()}
											>
												Save
											</button>
											<button
												type="button"
												class="button button-outline button-small"
												on:click={cancelSubstitution}
											>
												Cancel
											</button>
										</div>
									</fieldset>
								{/if}
							{/each}
						</div>

						{#if excludedIngredients.length > 0}
							<div class="exclusion-summary">
								<small>
									{excludedIngredients.length} ingredient{excludedIngredients.length !== 1 ? 's' : ''} excluded from shopping list
								</small>
							</div>
						{/if}
					</fieldset>
				{/if}

				<!-- Form Actions -->
				<div class="form-actions">
					<button type="button" class="button button-outline" on:click={close}>
						Cancel
					</button>
					<button 
						type="submit" 
						class="button"
						disabled={loading || !selectedRecipe || !selectedDate}
					>
						{loading ? 'Scheduling...' : editingMealId ? 'Update Meal' : 'Schedule Meal'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.scheduler-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 2rem;
	}

	.scheduler-modal {
		background: white;
		border-radius: 0.4rem;
		max-width: 60rem;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 2rem 4rem rgba(0, 0, 0, 0.2);
	}

	.scheduler-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 2rem 2rem 0;
		border-bottom: 0.1rem solid #e1e1e1;
		margin-bottom: 2rem;
	}

	.scheduler-header h2 {
		margin: 0;
		color: #2c3e50;
	}

	.close-button {
		background: none;
		border: none;
		font-size: 2.4rem;
		cursor: pointer;
		color: #9b9b9b;
		line-height: 1;
		padding: 0;
		width: 3rem;
		height: 3rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-button:hover {
		color: #606c76;
	}

	.scheduler-form {
		padding: 0 2rem 2rem;
	}

	fieldset {
		border: 0.1rem solid #e1e1e1;
		border-radius: 0.4rem;
		padding: 1.5rem;
		margin-bottom: 2rem;
	}

	legend {
		font-weight: 600;
		color: #2c3e50;
		padding: 0 1rem;
	}

	.field-description {
		color: #606c76;
		font-size: 1.4rem;
		margin-bottom: 1.5rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-group:last-child {
		margin-bottom: 0;
	}

	.recipe-selector {
		position: relative;
	}

	.recipe-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: white;
		border: 0.1rem solid #e1e1e1;
		border-top: none;
		border-radius: 0 0 0.4rem 0.4rem;
		max-height: 20rem;
		overflow-y: auto;
		z-index: 10;
		box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.1);
	}

	.recipe-option {
		width: 100%;
		padding: 1rem;
		text-align: left;
		border: none;
		background: white;
		cursor: pointer;
		border-bottom: 0.1rem solid #f4f5f6;
	}

	.recipe-option:hover,
	.recipe-option:focus {
		background-color: #f4f5f6;
	}

	.recipe-option[aria-selected="true"] {
		background-color: #9b4dca;
		color: white;
	}

	.recipe-name {
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.recipe-meta {
		font-size: 1.2rem;
		color: #606c76;
	}

	.recipe-option[aria-selected="true"] .recipe-meta {
		color: rgba(255, 255, 255, 0.8);
	}

	.selected-recipe {
		margin-top: 1rem;
		padding: 1rem;
		background-color: #f4f5f6;
		border-radius: 0.4rem;
	}

	.selected-recipe small {
		color: #606c76;
		display: block;
		margin-top: 0.5rem;
	}

	.ingredients-checklist {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.ingredient-item {
		border: 0.1rem solid #e1e1e1;
		border-radius: 0.4rem;
		padding: 1rem;
		background: white;
		transition: all 0.2s ease;
	}

	.ingredient-item:hover {
		background-color: #f4f5f6;
		border-color: #d1d1d1;
	}

	.ingredient-checkbox {
		display: flex;
		align-items: center;
		gap: 1rem;
		cursor: pointer;
		margin-bottom: 0;
	}

	.ingredient-checkbox input[type="checkbox"] {
		margin: 0;
		cursor: pointer;
	}

	.ingredient-details {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex: 1;
		gap: 1rem;
	}

	.ingredient-name {
		font-weight: 500;
		color: #2c3e50;
	}

	.ingredient-name.substituted {
		color: #9b4dca;
		font-weight: 600;
	}

	.substitution-indicator {
		color: #9b4dca;
		font-weight: normal;
		font-style: italic;
		margin-left: 0.5rem;
	}

	.ingredient-amount {
		color: #606c76;
		font-size: 1.3rem;
		flex-shrink: 0;
	}

	/* Icon buttons for inline actions */
	.swap-icon-button,
	.reset-icon-button {
		background: none;
		border: 0.1rem solid #d1d1d1;
		border-radius: 0.3rem;
		width: 2.4rem;
		height: 2.4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 1.4rem;
		color: #606c76;
		flex-shrink: 0;
		transition: all 0.2s ease;
	}

	.swap-icon-button:hover {
		background-color: #f4f5f6;
		border-color: #9b4dca;
		color: #9b4dca;
	}

	.reset-icon-button:hover {
		background-color: #f8d7da;
		border-color: #f5c6cb;
		color: #721c24;
	}

	/* Substitution form */
	.substitution-form {
		margin-top: 1rem;
		padding: 1.5rem;
		background: #f9f9fb;
		border: 0.1rem solid #e1e1e1;
		border-radius: 0.4rem;
		border-left: 0.3rem solid #9b4dca;
	}

	.substitution-form legend {
		color: #9b4dca;
		font-weight: 600;
		font-size: 1.3rem;
		padding: 0 0.5rem;
	}

	.substitution-inputs {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.substitution-field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.substitution-field label {
		font-size: 1.2rem;
		font-weight: 600;
		color: #2c3e50;
	}

	.substitution-input {
		padding: 0.8rem;
		border: 0.1rem solid #d1d1d1;
		border-radius: 0.4rem;
		font-size: 1.3rem;
		background: white;
	}

	.substitution-input:focus {
		outline: none;
		border-color: #9b4dca;
		box-shadow: 0 0 0 0.2rem rgba(155, 77, 202, 0.25);
	}

	.substitution-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}

	/* Fix button-small padding issues */
	.button-small {
		padding: 0.5rem 1rem;
		font-size: 1.2rem;
		line-height: 1.2;
		height: auto;
		min-height: auto;
	}

	.exclusion-summary {
		margin-top: 1rem;
		padding: 1rem;
		background-color: #f4f5f6;
		border-radius: 0.4rem;
		text-align: center;
	}

	.exclusion-summary small {
		color: #606c76;
		font-style: italic;
	}

	.ingredient-reference-image {
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: #f8f9fa;
		border: 0.1rem solid #e1e1e1;
		border-radius: 0.4rem;
		text-align: center;
	}

	.ingredient-reference-image h4 {
		margin: 0 0 0.5rem 0;
		color: #2c3e50;
		font-size: 1.4rem;
	}

	.ingredient-reference-image .image-caption {
		color: #606c76;
		font-size: 1.3rem;
		margin-bottom: 1rem;
	}

	.reference-image {
		max-width: 100%;
		height: auto;
		max-height: 300px;
		border-radius: 0.4rem;
		border: 0.1rem solid #d1d1d1;
		object-fit: contain;
		background: white;
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		margin-top: 2rem;
		padding-top: 2rem;
		border-top: 0.1rem solid #e1e1e1;
	}

	.button-small {
		padding: 0.5rem 1rem;
		font-size: 1.2rem;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.scheduler-overlay {
			padding: 1rem;
		}

		.scheduler-modal {
			max-height: 95vh;
		}

		.scheduler-header {
			padding: 1.5rem 1.5rem 0;
		}

		.scheduler-form {
			padding: 0 1.5rem 1.5rem;
		}

		.form-row {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.form-actions {
			flex-direction: column;
		}

		.form-actions button {
			width: 100%;
		}

		.substitution-inputs {
			grid-template-columns: 1fr;
		}

		.swap-icon-button,
		.reset-icon-button {
			width: 3rem;
			height: 3rem;
			font-size: 1.6rem;
		}

		.ingredient-reference-image {
			padding: 1rem;
		}

		.reference-image {
			max-height: 200px;
		}
	}
</style>