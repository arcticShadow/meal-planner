<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { format } from 'date-fns';
	import { shoppingStore, shoppingListStats } from '$lib/stores/shopping.js';

	const dispatch = createEventDispatcher<{
		action: { type: 'export' | 'print' | 'share' | 'clear'; success: boolean };
		error: { message: string };
	}>();

	// Props
	export let disabled = false;
	export let showClearAction = true;

	// Store subscriptions
	$: stats = $shoppingListStats;
	$: shoppingState = $shoppingStore;

	// Local state
	let isWorking = false;

	async function exportList() {
		if (stats.total === 0) {
			dispatch('error', { message: 'No items to export' });
			return;
		}

		isWorking = true;
		try {
			const listText = shoppingStore.exportAsText();
			const blob = new Blob([listText], { type: 'text/plain' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `shopping-list-${format(new Date(), 'yyyy-MM-dd')}.txt`;
			a.click();
			URL.revokeObjectURL(url);
			
			dispatch('action', { type: 'export', success: true });
		} catch (error) {
			dispatch('error', { 
				message: error instanceof Error ? error.message : 'Failed to export shopping list'
			});
		} finally {
			isWorking = false;
		}
	}

	function printList() {
		if (stats.total === 0) {
			dispatch('error', { message: 'No items to print' });
			return;
		}

		isWorking = true;
		try {
			const printWindow = window.open('', '_blank');
			if (!printWindow) {
				throw new Error('Unable to open print window. Please allow popups.');
			}

			const printContent = generatePrintContent();
			printWindow.document.write(printContent);
			printWindow.document.close();
			printWindow.print();
			
			dispatch('action', { type: 'print', success: true });
		} catch (error) {
			dispatch('error', { 
				message: error instanceof Error ? error.message : 'Failed to print shopping list'
			});
		} finally {
			isWorking = false;
		}
	}

	function shareList() {
		if (stats.total === 0) {
			dispatch('error', { message: 'No items to share' });
			return;
		}

		isWorking = true;
		try {
			const listText = shoppingStore.exportAsText();
			
			if (navigator.share) {
				// Use native sharing if available
				navigator.share({
					title: 'Shopping List',
					text: listText,
					url: window.location.href
				}).then(() => {
					dispatch('action', { type: 'share', success: true });
				}).catch(() => {
					fallbackShare(listText);
				});
			} else {
				fallbackShare(listText);
			}
		} catch (error) {
			dispatch('error', { 
				message: error instanceof Error ? error.message : 'Failed to share shopping list'
			});
		} finally {
			isWorking = false;
		}
	}

	function fallbackShare(listText: string) {
		try {
			// Copy to clipboard as fallback
			navigator.clipboard.writeText(listText).then(() => {
				alert('Shopping list copied to clipboard!');
				dispatch('action', { type: 'share', success: true });
			}).catch(() => {
				// Final fallback - show text in modal
				alert(`Shopping List:\n\n${listText}`);
				dispatch('action', { type: 'share', success: true });
			});
		} catch (error) {
			dispatch('error', { message: 'Unable to share shopping list' });
		}
	}

	async function clearList() {
		if (stats.total === 0) {
			dispatch('error', { message: 'Shopping list is already empty' });
			return;
		}

		const confirmed = confirm('Are you sure you want to clear the entire shopping list? This cannot be undone.');
		if (!confirmed) return;

		isWorking = true;
		try {
			await shoppingStore.clearShoppingList();
			dispatch('action', { type: 'clear', success: true });
		} catch (error) {
			dispatch('error', { 
				message: error instanceof Error ? error.message : 'Failed to clear shopping list'
			});
		} finally {
			isWorking = false;
		}
	}

	function generatePrintContent(): string {
		const currentDate = format(new Date(), 'PPP');
		const items = shoppingState.items;

		return `
			<html>
				<head>
					<title>Shopping List - ${currentDate}</title>
					<style>
						@media print {
							body { 
								font-family: Arial, sans-serif; 
								margin: 2rem; 
								color: #000;
								background: white;
							}
							h1 { 
								color: #000; 
								margin-bottom: 2rem; 
								border-bottom: 2px solid #000;
								padding-bottom: 1rem;
							}
							.header-info {
								margin-bottom: 2rem;
								font-size: 0.9em;
								color: #666;
							}
							.item { 
								margin-bottom: 1rem; 
								padding: 0.8rem 0; 
								border-bottom: 1px solid #ddd;
								display: flex;
								justify-content: space-between;
								align-items: center;
							}
							.item-name { 
								font-weight: 600; 
								font-size: 1.1em;
							}
							.item-quantity { 
								color: #666; 
								font-weight: 600;
							}
							.consolidated { 
								color: #28a745; 
								font-size: 0.8em; 
								margin-left: 0.5rem;
							}
							.footer {
								margin-top: 3rem;
								padding-top: 1rem;
								border-top: 1px solid #ddd;
								font-size: 0.9em;
								color: #666;
								text-align: center;
							}
							.stats {
								display: flex;
								justify-content: space-around;
								margin-bottom: 1rem;
								padding: 1rem;
								background: #f8f9fa;
								border-radius: 0.5rem;
							}
							.stat {
								text-align: center;
							}
							.stat-number {
								font-size: 1.5em;
								font-weight: bold;
								color: #000;
							}
							.stat-label {
								font-size: 0.9em;
								color: #666;
							}
						}
					</style>
				</head>
				<body>
					<h1>Shopping List</h1>
					<div class="header-info">
						Generated on ${currentDate} from Menu Planner
					</div>
					
					<div class="stats">
						<div class="stat">
							<div class="stat-number">${stats.total}</div>
							<div class="stat-label">Total Items</div>
						</div>
						<div class="stat">
							<div class="stat-number">${stats.consolidated}</div>
							<div class="stat-label">Consolidated</div>
						</div>
						<div class="stat">
							<div class="stat-number">${stats.completionPercentage}%</div>
							<div class="stat-label">Complete</div>
						</div>
					</div>

					${items.map(item => `
						<div class="item">
							<div class="item-info">
								<span class="item-name">☐ ${item.ingredient}</span>
								${item.consolidated ? '<span class="consolidated">(consolidated)</span>' : ''}
							</div>
							<span class="item-quantity">${item.quantity}${item.unit}</span>
						</div>
					`).join('')}

					<div class="footer">
						<strong>Total: ${stats.total} items</strong><br>
						Generated by Menu Planner on ${currentDate}
					</div>
				</body>
			</html>
		`;
	}
</script>

<div class="actions-container">
	<div class="actions-header">
		<h4>Actions</h4>
		<div class="actions-stats">
			{stats.total} items • {stats.completionPercentage}% complete
		</div>
	</div>

	<div class="actions-grid">
		<button 
			class="action-button export-button"
			on:click={exportList}
			disabled={disabled || isWorking || stats.total === 0}
			title="Export shopping list as text file"
		>
			<span class="action-icon">📄</span>
			<span class="action-label">Export</span>
		</button>

		<button 
			class="action-button print-button"
			on:click={printList}
			disabled={disabled || isWorking || stats.total === 0}
			title="Print shopping list"
		>
			<span class="action-icon">🖨️</span>
			<span class="action-label">Print</span>
		</button>

		<button 
			class="action-button share-button"
			on:click={shareList}
			disabled={disabled || isWorking || stats.total === 0}
			title="Share shopping list"
		>
			<span class="action-icon">📤</span>
			<span class="action-label">Share</span>
		</button>

		{#if showClearAction}
			<button 
				class="action-button clear-button"
				on:click={clearList}
				disabled={disabled || isWorking || stats.total === 0}
				title="Clear entire shopping list"
			>
				<span class="action-icon">🗑️</span>
				<span class="action-label">Clear</span>
			</button>
		{/if}
	</div>

	{#if isWorking}
		<div class="working-indicator">
			<span>Working...</span>
		</div>
	{/if}
</div>

<style>
	.actions-container {
		background: white;
		border: 0.1rem solid #e1e1e1;
		border-radius: 0.4rem;
		padding: 1.5rem;
	}

	.actions-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.actions-header h4 {
		margin: 0;
		color: #2c3e50;
		font-size: 1.4rem;
	}

	.actions-stats {
		font-size: 1.2rem;
		color: #606c76;
		font-weight: 600;
	}

	.actions-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 1rem;
	}

	.action-button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1.2rem;
		border: 0.1rem solid #e1e1e1;
		border-radius: 0.4rem;
		background: white;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 1.3rem;
		text-decoration: none;
		color: #2c3e50;
	}

	.action-button:hover:not(:disabled) {
		background: #f8f9fa;
		border-color: #9b4dca;
		transform: translateY(-1px);
		box-shadow: 0 0.2rem 0.4rem rgba(0,0,0,0.1);
	}

	.action-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.action-icon {
		font-size: 2rem;
		line-height: 1;
	}

	.action-label {
		font-weight: 600;
		font-size: 1.2rem;
	}

	.clear-button:hover:not(:disabled) {
		border-color: #e85600;
		background: #fff5f0;
	}

	.working-indicator {
		text-align: center;
		margin-top: 1rem;
		padding: 1rem;
		background: #f8f9fa;
		border-radius: 0.3rem;
		color: #606c76;
		font-style: italic;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.actions-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.actions-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 40rem) {
		.actions-container {
			padding: 1rem;
		}
		
		.actions-grid {
			grid-template-columns: 1fr;
		}

		.action-button {
			flex-direction: row;
			justify-content: flex-start;
			text-align: left;
		}

		.action-icon {
			font-size: 1.5rem;
		}
	}
</style>