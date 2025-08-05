<script lang="ts">
	import { format } from 'date-fns';
	import type { ShoppingListItem } from '$lib/services/database.js';
	import { itemsWithBreakdown } from '$lib/stores/shopping.js';

	// Props
	export let item: ShoppingListItem;
	export let expanded = false;

	// Store subscriptions
	$: itemsWithDetails = $itemsWithBreakdown;

	// Get breakdown details for this item
	$: breakdown = itemsWithDetails.find(detail => detail.id === item.id)?.breakdown || [];

	function formatDate(dateStr: string): string {
		try {
			return format(new Date(dateStr), 'PPP');
		} catch {
			return dateStr;
		}
	}

	function formatShortDate(dateStr: string): string {
		try {
			return format(new Date(dateStr), 'MMM d');
		} catch {
			return dateStr;
		}
	}

	// Calculate individual quantities (simple division for now)
	function getIndividualQuantity(totalQuantity: number, mealCount: number): number {
		return Math.round((totalQuantity / mealCount) * 100) / 100;
	}
</script>

{#if expanded && breakdown.length > 0}
	<div class="breakdown-container">
		<div class="breakdown-header">
			<h4>Breakdown by meal:</h4>
			<div class="breakdown-summary">
				{breakdown.length} meal{breakdown.length > 1 ? 's' : ''} • 
				Total: {item.quantity}{item.unit}
			</div>
		</div>

		<div class="breakdown-list">
			{#each breakdown as detail, index}
				<div class="breakdown-item">
					<div class="breakdown-meal-info">
						<div class="meal-header">
							<strong class="meal-name">{detail.mealName}</strong>
							<span class="meal-badge">Meal {index + 1}</span>
						</div>
						<div class="meal-date">
							<span class="date-full">{formatDate(detail.date)}</span>
							<span class="date-short">{formatShortDate(detail.date)}</span>
						</div>
					</div>
					
					<div class="breakdown-quantity">
						<span class="quantity-amount">
							{getIndividualQuantity(item.quantity, breakdown.length)}{item.unit}
						</span>
						<span class="quantity-label">per meal</span>
					</div>
				</div>
			{/each}
		</div>

		{#if item.consolidated}
			<div class="consolidation-note">
				<div class="consolidation-icon">⚡</div>
				<div class="consolidation-text">
					<strong>Consolidated ingredient</strong><br>
					This combines {item.ingredient.toLowerCase()} from {breakdown.length} different meals for efficient shopping.
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.breakdown-container {
		border-top: 0.1rem solid #e1e1e1;
		padding: 1.5rem;
		background-color: #f8f9fa;
		margin-top: 0;
	}

	.breakdown-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.breakdown-header h4 {
		margin: 0;
		font-size: 1.4rem;
		color: #2c3e50;
	}

	.breakdown-summary {
		font-size: 1.2rem;
		color: #606c76;
		font-weight: 600;
	}

	.breakdown-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.breakdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.2rem;
		background: white;
		border-radius: 0.4rem;
		border: 0.1rem solid #e1e1e1;
		transition: all 0.2s ease;
	}

	.breakdown-item:hover {
		box-shadow: 0 0.1rem 0.3rem rgba(0,0,0,0.1);
	}

	.breakdown-meal-info {
		flex: 1;
	}

	.meal-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.meal-name {
		font-size: 1.4rem;
		color: #2c3e50;
	}

	.meal-badge {
		background-color: #9b4dca;
		color: white;
		font-size: 1rem;
		padding: 0.2rem 0.6rem;
		border-radius: 1rem;
		font-weight: 600;
	}

	.meal-date {
		color: #606c76;
	}

	.date-full {
		font-size: 1.2rem;
	}

	.date-short {
		display: none;
	}

	.breakdown-quantity {
		text-align: right;
		min-width: 100px;
	}

	.quantity-amount {
		display: block;
		font-size: 1.4rem;
		font-weight: 600;
		color: #9b4dca;
		margin-bottom: 0.2rem;
	}

	.quantity-label {
		font-size: 1rem;
		color: #606c76;
	}

	.consolidation-note {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		margin-top: 1.5rem;
		padding: 1rem;
		background: linear-gradient(135deg, #32b643, #28a745);
		color: white;
		border-radius: 0.4rem;
	}

	.consolidation-icon {
		font-size: 2rem;
		line-height: 1;
	}

	.consolidation-text {
		flex: 1;
		font-size: 1.3rem;
	}

	.consolidation-text strong {
		display: block;
		margin-bottom: 0.3rem;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.breakdown-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.breakdown-item {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
		}

		.breakdown-quantity {
			text-align: left;
			min-width: auto;
		}

		.meal-header {
			flex-wrap: wrap;
		}
	}

	@media (max-width: 40rem) {
		.breakdown-container {
			padding: 1rem;
		}

		.date-full {
			display: none;
		}

		.date-short {
			display: inline;
			font-size: 1.2rem;
		}

		.meal-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.consolidation-note {
			flex-direction: column;
			text-align: center;
		}

		.consolidation-icon {
			align-self: center;
		}
	}
</style>