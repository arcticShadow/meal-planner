<script lang="ts">
	import { onMount } from 'svelte';
	import { format } from 'date-fns';
	import {
		shoppingStore,
		shoppingListStats,
		itemsByStatus,
		itemsWithBreakdown,
		autoGenerateShoppingList
	} from '$lib/stores/shopping.js';
	import { mealsWithRecipes } from '$lib/stores/meals.js';
	import type { ShoppingListItem } from '$lib/services/database.js';

	// Store subscriptions
	$: shoppingState = $shoppingStore;
	$: stats = $shoppingListStats;
	$: itemsByStatusData = $itemsByStatus;
	$: itemsWithDetails = $itemsWithBreakdown;
	$: mealsData = $mealsWithRecipes;
	$: availableMeals = $autoGenerateShoppingList;

	// Derived values
	$: checkedItems = itemsByStatusData.checked;
	$: uncheckedItems = itemsByStatusData.unchecked;
	$: allItems = shoppingState.items;

	// Local UI state
	let expandedItems = new Set<string>();
	let isGenerating = false;
	let showEmptyState = false;

	onMount(async () => {
		// Load existing shopping list
		await shoppingStore.loadShoppingList();
		
		// Check if we should show empty state
		showEmptyState = shoppingState.items.length === 0;
	});

	function toggleExpanded(itemId: string) {
		if (expandedItems.has(itemId)) {
			expandedItems.delete(itemId);
		} else {
			expandedItems.add(itemId);
		}
		expandedItems = expandedItems; // Trigger reactivity
	}

	async function toggleChecked(itemId: string) {
		try {
			await shoppingStore.toggleItemChecked(itemId);
		} catch (error) {
			console.error('Failed to toggle item:', error);
		}
	}

	async function clearList() {
		if (confirm('Are you sure you want to clear the shopping list?')) {
			try {
				await shoppingStore.clearShoppingList();
				expandedItems.clear();
				expandedItems = expandedItems;
			} catch (error) {
				console.error('Failed to clear shopping list:', error);
			}
		}
	}

	async function generateShoppingList() {
		if (availableMeals.length === 0) {
			alert('No planned meals found. Please plan some meals first.');
			return;
		}

		if (shoppingState.items.length > 0) {
			const confirmed = confirm('This will replace your current shopping list. Continue?');
			if (!confirmed) return;
		}

		isGenerating = true;
		try {
			const itemCount = await shoppingStore.generateShoppingList(availableMeals);
			expandedItems.clear();
			expandedItems = expandedItems;
			showEmptyState = false;
			
			// Show success message
			if (itemCount > 0) {
				alert(`Generated shopping list with ${itemCount} items from ${availableMeals.length} planned meals.`);
			}
		} catch (error) {
			console.error('Failed to generate shopping list:', error);
			alert('Failed to generate shopping list. Please try again.');
		} finally {
			isGenerating = false;
		}
	}

	function exportList() {
		try {
			const listText = shoppingStore.exportAsText();
			const blob = new Blob([listText], { type: 'text/plain' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `shopping-list-${format(new Date(), 'yyyy-MM-dd')}.txt`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Failed to export shopping list:', error);
			alert('Failed to export shopping list. Please try again.');
		}
	}

	function printList() {
		const printWindow = window.open('', '_blank');
		if (!printWindow) return;

		const printContent = `
			<html>
				<head>
					<title>Shopping List - ${format(new Date(), 'PPP')}</title>
					<style>
						body { font-family: Arial, sans-serif; margin: 2rem; }
						h1 { color: #2c3e50; margin-bottom: 2rem; }
						.item { margin-bottom: 1rem; padding: 0.5rem 0; border-bottom: 1px solid #eee; }
						.item-name { font-weight: 600; }
						.item-quantity { color: #9b4dca; margin-left: 1rem; }
						.consolidated { color: #32b643; font-size: 0.8em; }
						.breakdown { margin-left: 2rem; margin-top: 0.5rem; font-size: 0.9em; color: #666; }
					</style>
				</head>
				<body>
					<h1>Shopping List - ${format(new Date(), 'PPP')}</h1>
					${shoppingState.items.map(item => `
						<div class="item">
							<span class="item-name">${item.ingredient}</span>
							<span class="item-quantity">${item.quantity}${item.unit}</span>
							${item.consolidated ? '<span class="consolidated">(consolidated)</span>' : ''}
						</div>
					`).join('')}
					<p style="margin-top: 2rem; color: #666;">
						Total: ${stats.total} items | Generated on ${format(new Date(), 'PPP')}
					</p>
				</body>
			</html>
		`;

		printWindow.document.write(printContent);
		printWindow.document.close();
		printWindow.print();
	}

	function getItemBreakdown(item: ShoppingListItem) {
		const details = itemsWithDetails.find(detail => detail.id === item.id);
		return details?.breakdown || [];
	}
</script>

<svelte:head>
	<title>Shopping List - Menu Planner</title>
</svelte:head>

<div class="page-header">
	<h1>Shopping List</h1>
	<p>Consolidated ingredients from your planned meals</p>
</div>

<div class="shopping-controls">
	<div class="row">
		<div class="column column-50">
			<div class="list-stats">
				<span class="badge badge-secondary">{stats.total} items</span>
				<span class="badge badge-success">{stats.checked} checked</span>
				<span class="badge">{stats.remaining} remaining</span>
				{#if stats.consolidated > 0}
					<span class="badge badge-primary">{stats.consolidated} consolidated</span>
				{/if}
			</div>
		</div>
		<div class="column column-50">
			<div class="list-actions">
				<button class="button button-outline" on:click={exportList} disabled={allItems.length === 0}>
					Export List
				</button>
				<button class="button button-outline" on:click={printList} disabled={allItems.length === 0}>
					Print List
				</button>
				<button class="button button-outline" on:click={clearList} disabled={allItems.length === 0}>
					Clear List
				</button>
				<button
					class="button"
					on:click={generateShoppingList}
					disabled={isGenerating || availableMeals.length === 0}
				>
					{#if isGenerating}
						Generating...
					{:else if availableMeals.length === 0}
						No Meals Planned
					{:else}
						Regenerate from {availableMeals.length} Meals
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>

{#if shoppingState.loading}
	<div class="loading-state">
		<div class="card">
			<p>Loading shopping list...</p>
		</div>
	</div>
{:else if shoppingState.error}
	<div class="error-state">
		<div class="card alert alert-error">
			<p><strong>Error:</strong> {shoppingState.error}</p>
			<button class="button button-outline" on:click={() => shoppingStore.clearError()}>
				Dismiss
			</button>
		</div>
	</div>
{:else if allItems.length === 0}
	<div class="empty-state">
		<div class="card">
			<div class="card-header">
				<h3 class="card-title">No shopping items</h3>
			</div>
			<p>Your shopping list is empty.</p>
			{#if availableMeals.length > 0}
				<p>You have {availableMeals.length} planned meals. Generate your shopping list now!</p>
				<div style="text-align: center; margin-top: 1.5rem;">
					<button class="button" on:click={generateShoppingList} disabled={isGenerating}>
						{isGenerating ? 'Generating...' : 'Generate Shopping List'}
					</button>
				</div>
			{:else}
				<p>Plan some meals first to generate your shopping list.</p>
				<div style="text-align: center; margin-top: 1.5rem;">
					<a href="/planning" class="button">Plan Meals</a>
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div class="shopping-list">
		{#each allItems as item (item.id)}
			<div class="shopping-item" class:checked={shoppingState.checkedItems.has(item.id || '')}>
				<div class="item-main">
					<div class="item-checkbox">
						<input
							type="checkbox"
							id="item-{item.id}"
							checked={shoppingState.checkedItems.has(item.id || '')}
							on:change={() => toggleChecked(item.id || '')}
						/>
					</div>
					
					<div class="item-content">
						<div class="item-header">
							<label for="item-{item.id}" class="item-name">
								{item.ingredient}
							</label>
							<div class="item-quantity">
								{item.quantity}{item.unit}
								{#if item.consolidated}
									<span class="consolidated-badge">consolidated</span>
								{/if}
							</div>
						</div>
						
						{#if item.mealIds.length > 0}
							{#if item.mealIds.length === 1}
								<!-- Single meal - show meal info inline -->
								{@const breakdown = getItemBreakdown(item)}
								{#if breakdown.length > 0}
									<div class="single-meal-info">
										<span class="meal-label">From:</span>
										<strong class="meal-name">{breakdown[0].mealName}</strong>
										<span class="meal-date">on {format(new Date(breakdown[0].date), 'MMM d')}</span>
									</div>
								{/if}
							{:else}
								<!-- Multiple meals - show expandable breakdown -->
								<button
									class="expand-button"
									on:click={() => toggleExpanded(item.id || '')}
								>
									{expandedItems.has(item.id || '') ? '▼' : '▶'}
									Show breakdown ({item.mealIds.length} meals)
								</button>
							{/if}
						{/if}
					</div>
				</div>
				
				{#if expandedItems.has(item.id || '')}
					<div class="item-breakdown">
						<h4>Breakdown by meal:</h4>
						<div class="breakdown-list">
							{#each getItemBreakdown(item) as breakdown}
								<div class="breakdown-item">
									<div class="breakdown-meal">
										<strong>{breakdown.mealName}</strong>
										<span class="breakdown-date">{format(new Date(breakdown.date), 'PPP')}</span>
									</div>
									<div class="breakdown-quantity">
										{item.quantity / item.mealIds.length}{item.unit}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="shopping-summary">
		<div class="card">
			<div class="card-header">
				<h3 class="card-title">Shopping Summary</h3>
			</div>
			<div class="summary-content">
				<div class="summary-stats">
					<div class="stat-item">
						<span class="stat-number">{stats.total}</span>
						<span class="stat-label">Total Items</span>
					</div>
					<div class="stat-item">
						<span class="stat-number">{stats.consolidated}</span>
						<span class="stat-label">Consolidated</span>
					</div>
					<div class="stat-item">
						<span class="stat-number">{stats.completionPercentage}%</span>
						<span class="stat-label">Complete</span>
					</div>
				</div>
				
				<div class="summary-actions">
					<button
						class="button button-outline"
						style="width: 100%; margin-bottom: 1rem;"
						on:click={printList}
						disabled={allItems.length === 0}
					>
						Print Shopping List
					</button>
					<button
						class="button button-outline"
						style="width: 100%;"
						on:click={exportList}
						disabled={allItems.length === 0}
					>
						Export as Text
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

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

	.shopping-controls {
		margin-bottom: 3rem;
	}

	.list-stats {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.list-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}

	.empty-state {
		text-align: center;
	}

	.shopping-list {
		margin-bottom: 4rem;
	}

	.shopping-item {
		background: white;
		border: 0.1rem solid #e1e1e1;
		border-radius: 0.4rem;
		margin-bottom: 1rem;
		transition: all 0.2s ease;
	}

	.shopping-item:hover {
		box-shadow: 0 0.2rem 0.4rem rgba(0,0,0,0.1);
	}

	.shopping-item.checked {
		opacity: 0.6;
		background-color: #f8f9fa;
	}

	.shopping-item.checked .item-name {
		text-decoration: line-through;
		color: #9b9b9b;
	}

	.item-main {
		display: flex;
		align-items: flex-start;
		padding: 1.5rem;
	}

	.item-checkbox {
		margin-right: 1rem;
		margin-top: 0.2rem;
	}

	.item-checkbox input[type="checkbox"] {
		width: 1.8rem;
		height: 1.8rem;
		margin: 0;
	}

	.item-content {
		flex: 1;
	}

	.item-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}

	.item-name {
		font-size: 1.6rem;
		font-weight: 600;
		color: #2c3e50;
		cursor: pointer;
		margin: 0;
	}

	.item-quantity {
		font-size: 1.4rem;
		font-weight: 600;
		color: #9b4dca;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.consolidated-badge {
		background-color: #32b643;
		color: white;
		font-size: 1rem;
		padding: 0.2rem 0.5rem;
		border-radius: 0.3rem;
		font-weight: 600;
	}

	.single-meal-info {
		margin-top: 0.5rem;
		font-size: 1.2rem;
		color: #606c76;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.single-meal-info .meal-label {
		font-size: 1.1rem;
		color: #9b9b9b;
	}

	.single-meal-info .meal-name {
		color: #2c3e50;
		font-weight: 600;
	}

	.single-meal-info .meal-date {
		color: #9b4dca;
		font-weight: 500;
	}

	.expand-button {
		background: none;
		border: none;
		color: #9b4dca;
		cursor: pointer;
		font-size: 1.2rem;
		padding: 0;
		margin-top: 0.5rem;
	}

	.expand-button:hover {
		text-decoration: underline;
	}

	.item-breakdown {
		border-top: 0.1rem solid #e1e1e1;
		padding: 1.5rem;
		background-color: #f8f9fa;
	}

	.item-breakdown h4 {
		margin-bottom: 1rem;
		font-size: 1.4rem;
		color: #2c3e50;
	}

	.breakdown-list {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}

	.breakdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.8rem;
		background: white;
		border-radius: 0.3rem;
		border: 0.1rem solid #e1e1e1;
	}

	.breakdown-meal {
		display: flex;
		flex-direction: column;
	}

	.breakdown-date {
		font-size: 1.2rem;
		color: #606c76;
	}

	.breakdown-quantity {
		font-weight: 600;
		color: #9b4dca;
	}

	.shopping-summary {
		margin-bottom: 2rem;
	}

	.summary-content {
		display: flex;
		gap: 2rem;
		align-items: flex-start;
	}

	.summary-stats {
		display: flex;
		gap: 2rem;
		flex: 1;
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
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

	.summary-actions {
		min-width: 200px;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.list-actions {
			flex-direction: column;
		}

		.list-actions button {
			width: 100%;
		}

		.item-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.summary-content {
			flex-direction: column;
		}

		.summary-stats {
			justify-content: space-around;
		}
	}

	@media (max-width: 40rem) {
		.shopping-controls .row {
			flex-direction: column;
		}

		.list-stats {
			justify-content: center;
			margin-bottom: 1rem;
		}

		.list-actions {
			justify-content: center;
		}

		.breakdown-item {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.single-meal-info {
			font-size: 1.1rem;
		}

		.single-meal-info .meal-label {
			font-size: 1rem;
		}
	}
</style>