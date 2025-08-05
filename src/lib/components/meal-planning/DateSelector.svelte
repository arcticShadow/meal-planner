<script lang="ts">
	import { format, addDays, isSameDay, parseISO } from 'date-fns';
	import { availableDates, mealStore } from '../../stores/meals.js';
	import { createEventDispatcher } from 'svelte';

	export let selectedDate: string = '';
	export let showSuggestions: boolean = true;
	export let maxSuggestions: number = 5;

	const dispatch = createEventDispatcher<{
		dateSelected: { date: string };
	}>();

	let suggestedDate = '';
	let loading = false;

	// Get next available dates prioritized by proximity
	$: prioritizedDates = $availableDates.slice(0, maxSuggestions);

	// Load suggested date when component loads
	$: if (showSuggestions && !suggestedDate) {
		loadSuggestedDate();
	}

	async function loadSuggestedDate() {
		if (loading) return;
		
		loading = true;
		try {
			suggestedDate = await mealStore.findNextAvailableDate();
		} catch (error) {
			console.error('Error loading suggested date:', error);
		} finally {
			loading = false;
		}
	}

	function selectDate(date: string) {
		selectedDate = date;
		dispatch('dateSelected', { date });
	}

	function selectSuggested() {
		if (suggestedDate) {
			selectDate(suggestedDate);
		}
	}

	function formatDateDisplay(dateStr: string): string {
		const date = parseISO(dateStr);
		const today = new Date();
		const tomorrow = addDays(today, 1);
		
		if (isSameDay(date, today)) {
			return 'Today';
		} else if (isSameDay(date, tomorrow)) {
			return 'Tomorrow';
		} else {
			return format(date, 'EEE, MMM d');
		}
	}

	function getDaysFromToday(dateStr: string): number {
		const date = parseISO(dateStr);
		const today = new Date();
		const diffTime = date.getTime() - today.getTime();
		return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
	}
</script>

<div class="date-selector">
	<!-- Primary date input -->
	<div class="date-input-group">
		<label for="date-input" class="sr-only">Select date</label>
		<input
			id="date-input"
			type="date"
			bind:value={selectedDate}
			min={format(new Date(), 'yyyy-MM-dd')}
			class="date-input"
			on:change={() => dispatch('dateSelected', { date: selectedDate })}
		>
		
		{#if showSuggestions && suggestedDate && selectedDate !== suggestedDate}
			<button
				type="button"
				class="suggestion-button"
				on:click={selectSuggested}
				disabled={loading}
				aria-label="Use suggested date: {formatDateDisplay(suggestedDate)}"
			>
				Use suggested: {formatDateDisplay(suggestedDate)}
			</button>
		{/if}
	</div>

	<!-- Quick date suggestions -->
	{#if showSuggestions && prioritizedDates.length > 0}
		<div class="date-suggestions">
			<h4>Available dates:</h4>
			<div class="suggestion-buttons">
				{#each prioritizedDates as date}
					<button
						type="button"
						class="date-suggestion"
						class:selected={selectedDate === date}
						class:priority={date === suggestedDate}
						on:click={() => selectDate(date)}
						aria-label="Select {formatDateDisplay(date)}"
					>
						<span class="date-display">{formatDateDisplay(date)}</span>
						<span class="date-detail">
							{#if date === suggestedDate}
								Suggested
							{:else}
								{getDaysFromToday(date)} day{getDaysFromToday(date) !== 1 ? 's' : ''}
							{/if}
						</span>
					</button>
				{/each}
			</div>
			
			{#if prioritizedDates.length === 0 && !loading}
				<p class="no-suggestions">
					No available dates found in the next 30 days. All dates appear to be occupied.
				</p>
			{/if}
		</div>
	{/if}

	<!-- Selected date confirmation -->
	{#if selectedDate}
		<div class="selected-date-info">
			<span class="selected-label">Selected:</span>
			<span class="selected-value">
				{formatDateDisplay(selectedDate)} 
				({format(parseISO(selectedDate), 'yyyy-MM-dd')})
			</span>
		</div>
	{/if}
</div>

<style>
	.date-selector {
		width: 100%;
	}

	.date-input-group {
		margin-bottom: 1.5rem;
	}

	.date-input {
		width: 100%;
		margin-bottom: 1rem;
	}

	.suggestion-button {
		background: #f4f5f6;
		border: 0.1rem solid #e1e1e1;
		padding: 0.8rem 1.2rem;
		border-radius: 0.4rem;
		cursor: pointer;
		font-size: 1.3rem;
		color: #606c76;
		transition: all 0.2s ease;
		width: 100%;
	}

	.suggestion-button:hover:not(:disabled) {
		background: #e1e1e1;
		color: #2c3e50;
	}

	.suggestion-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.date-suggestions {
		margin-bottom: 1.5rem;
	}

	.date-suggestions h4 {
		margin-bottom: 1rem;
		color: #2c3e50;
		font-size: 1.4rem;
	}

	.suggestion-buttons {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.8rem;
	}

	.date-suggestion {
		background: #f4f5f6;
		border: 0.1rem solid #e1e1e1;
		padding: 1rem;
		border-radius: 0.4rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.date-suggestion:hover {
		background: #e1e1e1;
		border-color: #d1d1d1;
	}

	.date-suggestion.selected {
		background: #9b4dca;
		color: white;
		border-color: #9b4dca;
	}

	.date-suggestion.priority {
		border-color: #9b4dca;
		border-width: 0.2rem;
	}

	.date-suggestion.priority:not(.selected) {
		background: rgba(155, 77, 202, 0.05);
	}

	.date-display {
		font-weight: 600;
		font-size: 1.3rem;
	}

	.date-detail {
		font-size: 1.1rem;
		color: #606c76;
	}

	.date-suggestion.selected .date-detail {
		color: rgba(255, 255, 255, 0.8);
	}

	.no-suggestions {
		color: #9b9b9b;
		font-style: italic;
		text-align: center;
		padding: 2rem;
		background: #f9f9f9;
		border-radius: 0.4rem;
	}

	.selected-date-info {
		background: #f4f5f6;
		padding: 1rem;
		border-radius: 0.4rem;
		border-left: 0.4rem solid #9b4dca;
	}

	.selected-label {
		font-weight: 600;
		color: #2c3e50;
		margin-right: 0.5rem;
	}

	.selected-value {
		color: #606c76;
	}

	.sr-only {
		position: absolute;
		width: 0.1rem;
		height: 0.1rem;
		padding: 0;
		margin: -0.1rem;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* Responsive design */
	@media (max-width: 40rem) {
		.suggestion-buttons {
			grid-template-columns: 1fr;
		}
	}
</style>