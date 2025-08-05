<script lang="ts">
	import type { Recipe, Ingredient } from '../../services/database.js';
	import { COMMON_UNITS, RECIPE_CATEGORIES } from '../../utils/validators.js';
	import { createEventDispatcher } from 'svelte';

	export let recipe: Partial<Recipe> | null = null;
	export let isEditing = false;

	const dispatch = createEventDispatcher<{
		save: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>;
		cancel: void;
	}>();

	// Form data
	let formData: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> = {
		name: '',
		description: '',
		ingredients: [{ name: '', quantity: 1, unit: 'piece', optional: false }],
		instructions: [''],
		servings: 4,
		defaultDuration: 2,
		tags: [],
		category: '',
		prepTime: undefined,
		cookTime: undefined
	};

	// Form state
	let errors: Record<string, string> = {};
	let newTag = '';

	// Initialize form data if editing
	if (recipe) {
		formData = {
			name: recipe.name || '',
			description: recipe.description || '',
			ingredients: recipe.ingredients?.length ? [...recipe.ingredients] : [{ name: '', quantity: 1, unit: 'piece', optional: false }],
			instructions: recipe.instructions?.length ? [...recipe.instructions] : [''],
			servings: recipe.servings || 4,
			defaultDuration: recipe.defaultDuration || 2,
			tags: recipe.tags ? [...recipe.tags] : [],
			category: recipe.category || '',
			prepTime: recipe.prepTime,
			cookTime: recipe.cookTime
		};
	}

	function addIngredient() {
		formData.ingredients = [...formData.ingredients, { name: '', quantity: 1, unit: 'piece', optional: false }];
	}

	function removeIngredient(index: number) {
		if (formData.ingredients.length > 1) {
			formData.ingredients = formData.ingredients.filter((_, i) => i !== index);
		}
	}

	function addInstruction() {
		formData.instructions = [...formData.instructions, ''];
	}

	function removeInstruction(index: number) {
		if (formData.instructions.length > 1) {
			formData.instructions = formData.instructions.filter((_, i) => i !== index);
		}
	}

	function addTag() {
		const tag = newTag.trim();
		if (tag && !formData.tags.includes(tag)) {
			formData.tags = [...formData.tags, tag];
			newTag = '';
		}
	}

	function removeTag(index: number) {
		formData.tags = formData.tags.filter((_, i) => i !== index);
	}

	function handleTagKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			addTag();
		}
	}

	function validateForm(): boolean {
		errors = {};

		if (!formData.name.trim()) {
			errors.name = 'Recipe name is required';
		}

		if (!formData.description.trim()) {
			errors.description = 'Description is required';
		}

		if (formData.ingredients.some(ing => !ing.name.trim())) {
			errors.ingredients = 'All ingredients must have a name';
		}

		if (formData.instructions.some(inst => !inst.trim())) {
			errors.instructions = 'All instructions must be filled out';
		}

		if (formData.servings < 1 || formData.servings > 50) {
			errors.servings = 'Servings must be between 1 and 50';
		}

		if (formData.defaultDuration < 1 || formData.defaultDuration > 14) {
			errors.defaultDuration = 'Duration must be between 1 and 14 days';
		}

		return Object.keys(errors).length === 0;
	}

	function handleSubmit() {
		if (validateForm()) {
			// Clean up empty instructions and ingredients
			const cleanedData = {
				...formData,
				ingredients: formData.ingredients.filter(ing => ing.name.trim()),
				instructions: formData.instructions.filter(inst => inst.trim()),
				tags: formData.tags.filter(tag => tag.trim())
			};
			dispatch('save', cleanedData);
		}
	}

	function handleCancel() {
		dispatch('cancel');
	}
</script>

<div>
	<header>
		<h2>{isEditing ? 'Edit Recipe' : 'Add New Recipe'}</h2>
	</header>

	<form on:submit|preventDefault={handleSubmit}>
		<!-- Basic Information -->
		<fieldset>
			<legend>Basic Information</legend>
			
			<div class="form-group">
				<label for="name">Recipe Name *</label>
				<input
					id="name"
					type="text"
					bind:value={formData.name}
					class:error={errors.name}
					placeholder="Enter recipe name"
					required
				/>
				{#if errors.name}
					<span class="error-message">{errors.name}</span>
				{/if}
			</div>

			<div class="form-group">
				<label for="description">Description *</label>
				<textarea
					id="description"
					bind:value={formData.description}
					class:error={errors.description}
					placeholder="Describe your recipe"
					rows="3"
					required
				></textarea>
				{#if errors.description}
					<span class="error-message">{errors.description}</span>
				{/if}
			</div>

			<div class="row">
				<div class="column column-33">
					<label for="category">Category</label>
					<select id="category" bind:value={formData.category}>
						<option value="">Select category</option>
						{#each RECIPE_CATEGORIES as category}
							<option value={category}>{category}</option>
						{/each}
					</select>
				</div>

				<div class="column column-33">
					<label for="servings">Servings *</label>
					<input
						id="servings"
						type="number"
						bind:value={formData.servings}
						class:error={errors.servings}
						min="1"
						max="50"
						required
					/>
					{#if errors.servings}
						<small style="color: #e85600;">{errors.servings}</small>
					{/if}
				</div>

				<div class="column column-33">
					<label for="defaultDuration">Default Duration (days) *</label>
					<input
						id="defaultDuration"
						type="number"
						bind:value={formData.defaultDuration}
						class:error={errors.defaultDuration}
						min="1"
						max="14"
						required
					/>
					{#if errors.defaultDuration}
						<small style="color: #e85600;">{errors.defaultDuration}</small>
					{/if}
				</div>
			</div>

			<div class="row">
				<div class="column column-50">
					<label for="prepTime">Prep Time (minutes)</label>
					<input
						id="prepTime"
						type="number"
						bind:value={formData.prepTime}
						min="0"
						max="1440"
						placeholder="Optional"
					/>
				</div>

				<div class="column column-50">
					<label for="cookTime">Cook Time (minutes)</label>
					<input
						id="cookTime"
						type="number"
						bind:value={formData.cookTime}
						min="0"
						max="1440"
						placeholder="Optional"
					/>
				</div>
			</div>
		</fieldset>

		<!-- Ingredients -->
		<fieldset>
			<legend>Ingredients</legend>
			{#if errors.ingredients}
				<div class="alert alert-error">{errors.ingredients}</div>
			{/if}
			
			{#each formData.ingredients as ingredient, index}
				<div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto auto; gap: 1rem; align-items: center; margin-bottom: 1rem;">
					<input
						type="text"
						bind:value={ingredient.name}
						placeholder="Ingredient name"
					/>
					<input
						type="number"
						bind:value={ingredient.quantity}
						min="0"
						step="0.1"
					/>
					<select bind:value={ingredient.unit}>
						{#each COMMON_UNITS as unit}
							<option value={unit}>{unit}</option>
						{/each}
					</select>
					<label class="label-inline">
						<input type="checkbox" bind:checked={ingredient.optional} />
						Optional
					</label>
					<button
						type="button"
						class="button button-outline"
						on:click={() => removeIngredient(index)}
						disabled={formData.ingredients.length === 1}
						title="Remove ingredient"
						style="background-color: #f8d7da; border-color: #f5c6cb; color: #721c24;"
					>
						×
					</button>
				</div>
			{/each}
			
			<button type="button" class="button button-outline" on:click={addIngredient}>
				Add Ingredient
			</button>
		</fieldset>

		<!-- Instructions -->
		<fieldset>
			<legend>Instructions</legend>
			{#if errors.instructions}
				<div class="alert alert-error">{errors.instructions}</div>
			{/if}
			
			{#each formData.instructions as instruction, index}
				<div style="display: grid; grid-template-columns: auto 1fr auto; gap: 1rem; align-items: flex-start; margin-bottom: 1rem;">
					<strong style="padding-top: 0.6rem; min-width: 3rem;">{index + 1}.</strong>
					<textarea
						bind:value={instruction}
						placeholder="Enter instruction step"
						rows="2"
					></textarea>
					<button
						type="button"
						class="button button-outline"
						on:click={() => removeInstruction(index)}
						disabled={formData.instructions.length === 1}
						title="Remove instruction"
						style="background-color: #f8d7da; border-color: #f5c6cb; color: #721c24;"
					>
						×
					</button>
				</div>
			{/each}
			
			<button type="button" class="button button-outline" on:click={addInstruction}>
				Add Step
			</button>
		</fieldset>

		<!-- Tags -->
		<fieldset>
			<legend>Tags</legend>
			
			<div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
				<input
					type="text"
					bind:value={newTag}
					on:keydown={handleTagKeydown}
					placeholder="Add a tag and press Enter"
					style="flex: 1;"
				/>
				<button type="button" class="button button-outline" on:click={addTag}>Add</button>
			</div>
			
			{#if formData.tags.length > 0}
				<div style="display: flex; flex-wrap: wrap; gap: 1rem;">
					{#each formData.tags as tag, index}
						<span class="badge">
							{tag}
							<button type="button" style="background: none; border: none; color: white; margin-left: 0.5rem;" on:click={() => removeTag(index)}>×</button>
						</span>
					{/each}
				</div>
			{/if}
		</fieldset>

		<!-- Form Actions -->
		<div style="display: flex; gap: 2rem; justify-content: flex-end; padding-top: 3rem; border-top: 0.1rem solid #e1e1e1;">
			<button type="button" class="button button-outline" on:click={handleCancel}>
				Cancel
			</button>
			<button type="submit" class="button">
				{isEditing ? 'Update Recipe' : 'Save Recipe'}
			</button>
		</div>
	</form>
</div>

<style>
	input.error, textarea.error {
		border-color: #e85600;
	}

	/* Responsive design */
	@media (max-width: 40rem) {
		div[style*="grid-template-columns: 2fr 1fr 1fr auto auto"] {
			grid-template-columns: 1fr !important;
		}

		div[style*="grid-template-columns: auto 1fr auto"] {
			grid-template-columns: 1fr !important;
		}

		div[style*="justify-content: flex-end"] {
			flex-direction: column !important;
		}
	}
</style>