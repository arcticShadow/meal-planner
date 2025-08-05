<script lang="ts">
	import { onMount } from 'svelte';
	
	let isOffline = false;
	let dbSupported = false;

	onMount(() => {
		// Check if we're offline
		isOffline = !navigator.onLine;
		
		// Check IndexedDB support
		dbSupported = 'indexedDB' in window;
		
		// Listen for online/offline events
		const handleOnline = () => isOffline = false;
		const handleOffline = () => isOffline = true;
		
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		
		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});
</script>

<svelte:head>
	<title>Menu Planner - Home</title>
</svelte:head>

<div class="hero">
	<h1>Menu Planner</h1>
	<p class="hero-subtitle">
		Offline meal planning and recipe management that works entirely in your browser
	</p>
	
	<!-- Status indicators -->
	<div class="status-indicators">
		<div class="status-item">
			<span class="badge {isOffline ? 'badge-warning' : 'badge-success'}">
				{isOffline ? 'Offline' : 'Online'}
			</span>
			<span class="status-text">
				{isOffline ? 'Working offline' : 'Connected'}
			</span>
		</div>
		
		<div class="status-item">
			<span class="badge {dbSupported ? 'badge-success' : 'badge-error'}">
				Database
			</span>
			<span class="status-text">
				{dbSupported ? 'Ready' : 'Not supported'}
			</span>
		</div>
	</div>
</div>

<div class="features">
	<div class="row">
		<div class="column column-33">
			<div class="card">
				<div class="card-header">
					<h3 class="card-title">📚 Recipe Library</h3>
				</div>
				<p>
					Build your personal recipe collection by adding recipes manually or importing from JSON files. 
					Search and organize your recipes with tags and categories.
				</p>
				<a href="/recipes" class="button">Manage Recipes</a>
			</div>
		</div>
		
		<div class="column column-33">
			<div class="card">
				<div class="card-header">
					<h3 class="card-title">📅 Meal Planning</h3>
				</div>
				<p>
					Schedule meals for future dates with intelligent date prioritization. 
					Configure meal duration and plan weeks or months ahead.
				</p>
				<a href="/planning" class="button">Plan Meals</a>
			</div>
		</div>
		
		<div class="column column-33">
			<div class="card">
				<div class="card-header">
					<h3 class="card-title">🛒 Shopping Lists</h3>
				</div>
				<p>
					Automatically generate consolidated shopping lists from your planned meals. 
					See ingredient breakdown by meal and date.
				</p>
				<a href="/shopping" class="button">View Shopping List</a>
			</div>
		</div>
	</div>
</div>

<div class="getting-started">
	<div class="card">
		<div class="card-header">
			<h2 class="card-title">Getting Started</h2>
		</div>
		
		<div class="row">
			<div class="column column-50">
				<h4>1. Add Your First Recipe</h4>
				<p>
					Start by adding recipes to your library. You can enter them manually using our form, 
					or import multiple recipes from a JSON file.
				</p>
				
				<h4>2. Plan Your Meals</h4>
				<p>
					Use the meal planning calendar to schedule recipes for specific dates. 
					The system will suggest the closest available dates automatically.
				</p>
			</div>
			
			<div class="column column-50">
				<h4>3. Generate Shopping Lists</h4>
				<p>
					Once you've planned your meals, view your consolidated shopping list. 
					All ingredients are automatically combined and organized by meal.
				</p>
				
				<h4>4. Sync with Others (Optional)</h4>
				<p>
					Share your meal plans and recipes with family or roommates using our 
					browser-to-browser sync feature.
				</p>
			</div>
		</div>
		
		<div style="text-align: center; margin-top: 2rem;">
			<a href="/recipes" class="button" style="margin-right: 1rem;">Add Your First Recipe</a>
			<a href="/planning" class="button button-outline">Start Planning Meals</a>
		</div>
	</div>
</div>

<div class="features-highlight">
	<h2>Why Menu Planner?</h2>
	<div class="row">
		<div class="column column-25">
			<div class="feature-item">
				<h4>🔒 Privacy First</h4>
				<p>Your data never leaves your device. No accounts, no tracking, complete privacy.</p>
			</div>
		</div>
		
		<div class="column column-25">
			<div class="feature-item">
				<h4>📱 Works Offline</h4>
				<p>Full functionality without internet connection. Perfect for meal planning anywhere.</p>
			</div>
		</div>
		
		<div class="column column-25">
			<div class="feature-item">
				<h4>🤝 Collaborative</h4>
				<p>Share meal plans and recipes with others through direct browser-to-browser sync.</p>
			</div>
		</div>
		
		<div class="column column-25">
			<div class="feature-item">
				<h4>💾 Your Data</h4>
				<p>Export and import your complete database. No vendor lock-in, complete control.</p>
			</div>
		</div>
	</div>
</div>

<style>
	.hero {
		text-align: center;
		padding: 4rem 0;
		background: linear-gradient(135deg, #f4f5f6 0%, #e8e9ea 100%);
		margin: -2rem -2rem 4rem -2rem;
		border-radius: 0 0 1rem 1rem;
	}

	.hero h1 {
		font-size: 4.8rem;
		margin-bottom: 1rem;
		color: #2c3e50;
	}

	.hero-subtitle {
		font-size: 1.8rem;
		color: #606c76;
		margin-bottom: 3rem;
		max-width: 60rem;
		margin-left: auto;
		margin-right: auto;
	}

	.status-indicators {
		display: flex;
		justify-content: center;
		gap: 2rem;
		flex-wrap: wrap;
	}

	.status-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-text {
		font-size: 1.4rem;
		color: #606c76;
	}

	.features {
		margin-bottom: 4rem;
	}

	.getting-started {
		margin-bottom: 4rem;
	}

	.features-highlight {
		background: #f8f9fa;
		padding: 4rem 2rem;
		margin: 4rem -2rem -2rem -2rem;
		border-radius: 1rem 1rem 0 0;
		text-align: center;
	}

	.features-highlight h2 {
		margin-bottom: 3rem;
		color: #2c3e50;
	}

	.feature-item {
		text-align: center;
		padding: 1rem;
	}

	.feature-item h4 {
		margin-bottom: 1rem;
		color: #2c3e50;
	}

	.feature-item p {
		font-size: 1.4rem;
		color: #606c76;
		line-height: 1.6;
	}

	/* Responsive adjustments */
	@media (max-width: 40rem) {
		.hero {
			padding: 2rem 1rem;
			margin: -2rem -1rem 2rem -1rem;
		}

		.hero h1 {
			font-size: 3.6rem;
		}

		.hero-subtitle {
			font-size: 1.6rem;
		}

		.status-indicators {
			flex-direction: column;
			align-items: center;
			gap: 1rem;
		}

		.features-highlight {
			padding: 2rem 1rem;
			margin: 2rem -1rem -2rem -1rem;
		}
	}
</style>
