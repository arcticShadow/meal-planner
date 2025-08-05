import { writable, derived } from 'svelte/store';
import { syncService, type ConnectionState, type SyncMessage, type FullSyncData } from '../services/syncService.js';
import { recipeStore } from './recipes.js';
import { mealStore } from './meals.js';
import { shoppingStore } from './shopping.js';
import { DatabaseService, type Recipe, type Meal } from '../services/database.js';

// Sync store state
interface SyncState {
	connectionState: ConnectionState;
	localPeerId: string;
	remotePeerId: string | null;
	isHost: boolean;
	lastSyncTime: number | null;
	syncInProgress: boolean;
	error: string | null;
	connectionOffer: string | null;
	connectionAnswer: string | null;
	qrCodeData: string | null;
}

// Initial state
const initialState: SyncState = {
	connectionState: 'disconnected',
	localPeerId: '',
	remotePeerId: null,
	isHost: false,
	lastSyncTime: null,
	syncInProgress: false,
	error: null,
	connectionOffer: null,
	connectionAnswer: null,
	qrCodeData: null
};

// Create the main store
const { subscribe, update } = writable<SyncState>(initialState);

// Sync store actions
export const syncStore = {
	subscribe,

	// Initialize sync store
	initialize() {
		// Initialize sync service with event handlers
		syncService.initialize({
			onConnectionStateChange: (state: ConnectionState) => {
				update(store => ({ 
					...store, 
					connectionState: state,
					error: state === 'error' ? store.error : null
				}));
			},
			onPeerConnected: (peerId: string) => {
				update(store => ({ 
					...store, 
					remotePeerId: peerId,
					lastSyncTime: Date.now(),
					error: null
				}));
				
				// Automatically request full sync when first connected
				this.requestFullSync();
			},
			onPeerDisconnected: () => {
				update(store => ({ 
					...store, 
					remotePeerId: null,
					connectionOffer: null,
					connectionAnswer: null,
					qrCodeData: null,
					isHost: false
				}));
			},
			onSyncReceived: (message: SyncMessage) => {
				this.handleSyncMessage(message);
			},
			onError: (error: string) => {
				update(store => ({ ...store, error }));
			}
		});

		// Set local peer ID
		update(store => ({ 
			...store, 
			localPeerId: syncService.getLocalPeerId() 
		}));
	},

	// Create connection offer (become host)
	async createOffer() {
		update(store => ({ ...store, syncInProgress: true, error: null, isHost: true }));
		
		try {
			const result = await syncService.createRoomOffer();
			
			update(store => ({
				...store,
				connectionOffer: result.offer,
				qrCodeData: result.qrCodeData,
				syncInProgress: false
			}));
			
			return { offer: result.offer, qrCodeData: result.qrCodeData };
		} catch (error) {
			update(store => ({
				...store,
				syncInProgress: false,
				error: error instanceof Error ? error.message : 'Failed to create offer'
			}));
			throw error;
		}
	},

	// Join room directly (for QR code flow)
	async joinRoom(roomId: string, encodedOffer: string) {
		update(store => ({ ...store, syncInProgress: true, error: null, isHost: false }));
		
		try {
			await syncService.joinRoom(roomId, encodedOffer);
			
			update(store => ({
				...store,
				syncInProgress: false
			}));
		} catch (error) {
			update(store => ({
				...store,
				syncInProgress: false,
				error: error instanceof Error ? error.message : 'Failed to join room'
			}));
			throw error;
		}
	},

	// Accept connection offer (join as guest)
	async acceptOffer(encodedOffer: string) {
		update(store => ({ ...store, syncInProgress: true, error: null, isHost: false }));
		
		try {
			const answer = await syncService.acceptOffer(encodedOffer);
			
			update(store => ({ 
				...store, 
				connectionAnswer: answer,
				syncInProgress: false 
			}));
			
			return answer;
		} catch (error) {
			update(store => ({ 
				...store, 
				syncInProgress: false,
				error: error instanceof Error ? error.message : 'Failed to accept offer'
			}));
			throw error;
		}
	},

	// Complete connection (host receives answer)
	async completeConnection(encodedAnswer: string) {
		update(store => ({ ...store, syncInProgress: true, error: null }));
		
		try {
			await syncService.completeConnection(encodedAnswer);
			
			update(store => ({ 
				...store, 
				syncInProgress: false 
			}));
		} catch (error) {
			update(store => ({ 
				...store, 
				syncInProgress: false,
				error: error instanceof Error ? error.message : 'Failed to complete connection'
			}));
			throw error;
		}
	},

	// Disconnect from peer
	disconnect() {
		syncService.disconnect();
		update(store => ({ 
			...initialState,
			localPeerId: store.localPeerId 
		}));
	},

	// Request full sync from peer
	async requestFullSync() {
		if (!syncService.isConnected()) {
			update(store => ({ ...store, error: 'Not connected to peer' }));
			return;
		}

		update(store => ({ ...store, syncInProgress: true, error: null }));
		
		try {
			await syncService.requestFullSync();
		} catch (error) {
			update(store => ({ 
				...store, 
				syncInProgress: false,
				error: error instanceof Error ? error.message : 'Failed to request sync'
			}));
		}
	},

	// Send full sync data to peer
	async sendFullSync() {
		if (!syncService.isConnected()) {
			return;
		}

		try {
			await syncService.sendFullSync();
		} catch (error) {
			console.error('Failed to send full sync:', error);
		}
	},

	// Handle incoming sync messages
	async handleSyncMessage(message: SyncMessage) {
		try {
			switch (message.type) {
				case 'full_sync_response':
					await this.handleFullSyncResponse(message.data as FullSyncData);
					break;
				
				case 'recipe_create':
					await this.handleRecipeSync(message, 'create');
					break;
				
				case 'recipe_update':
					await this.handleRecipeSync(message, 'update');
					break;
				
				case 'recipe_delete':
					await this.handleRecipeSync(message, 'delete');
					break;
				
				case 'meal_create':
					await this.handleMealSync(message, 'create');
					break;
				
				case 'meal_update':
					await this.handleMealSync(message, 'update');
					break;
				
				case 'meal_delete':
					await this.handleMealSync(message, 'delete');
					break;
				
				case 'shopping_clear':
					await this.handleShoppingSync(message, 'clear');
					break;
				
				default:
					console.log('Unhandled sync message type:', message.type);
			}

			update(store => ({ ...store, lastSyncTime: Date.now() }));
		} catch (error) {
			console.error('Failed to handle sync message:', error);
			update(store => ({ 
				...store, 
				error: `Sync error: ${error instanceof Error ? error.message : 'Unknown error'}`
			}));
		}
	},

	// Handle full sync response
	async handleFullSyncResponse(syncData: FullSyncData) {
		update(store => ({ ...store, syncInProgress: true }));

		try {
			// Apply conflict resolution - use newer timestamps
			await this.mergeRecipes(syncData.recipes);
			await this.mergeMeals(syncData.meals);
			
			// Reload all stores to reflect changes
			await Promise.all([
				recipeStore.loadRecipes(),
				mealStore.loadMeals(),
				shoppingStore.loadShoppingList()
			]);

			update(store => ({ 
				...store, 
				syncInProgress: false,
				lastSyncTime: Date.now()
			}));
		} catch (error) {
			update(store => ({ 
				...store, 
				syncInProgress: false,
				error: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			}));
		}
	},

	// Handle recipe sync operations
	async handleRecipeSync(message: SyncMessage, operation: 'create' | 'update' | 'delete') {
		const recipe = message.data as Recipe;
		
		switch (operation) {
			case 'create': {
				// Check if recipe already exists (conflict resolution)
				const existing = await DatabaseService.getRecipe(recipe.id!);
				if (!existing) {
					await DatabaseService.createRecipe({
						name: recipe.name,
						description: recipe.description,
						ingredients: recipe.ingredients,
						instructions: recipe.instructions,
						servings: recipe.servings,
						defaultDuration: recipe.defaultDuration,
						tags: recipe.tags,
						category: recipe.category,
						prepTime: recipe.prepTime,
						cookTime: recipe.cookTime
					});
					recipeStore.loadRecipes();
				}
				break;
			}
			
			case 'update': {
				// Use timestamp-based conflict resolution
				const currentRecipe = await DatabaseService.getRecipe(recipe.id!);
				if (!currentRecipe || recipe.updatedAt >= currentRecipe.updatedAt) {
					await DatabaseService.updateRecipe(recipe.id!, {
						name: recipe.name,
						description: recipe.description,
						ingredients: recipe.ingredients,
						instructions: recipe.instructions,
						servings: recipe.servings,
						defaultDuration: recipe.defaultDuration,
						tags: recipe.tags,
						category: recipe.category,
						prepTime: recipe.prepTime,
						cookTime: recipe.cookTime,
						updatedAt: recipe.updatedAt
					});
					recipeStore.loadRecipes();
				}
				break;
			}
			
			case 'delete':
				await DatabaseService.deleteRecipe(recipe.id!);
				recipeStore.loadRecipes();
				break;
		}
	},

	// Handle meal sync operations
	async handleMealSync(message: SyncMessage, operation: 'create' | 'update' | 'delete') {
		const meal = message.data as Meal;
		
		switch (operation) {
			case 'create': {
				const existing = await DatabaseService.getMeal(meal.id!);
				if (!existing) {
					await DatabaseService.createMeal({
						recipeId: meal.recipeId,
						scheduledDate: meal.scheduledDate,
						duration: meal.duration,
						excludedIngredients: meal.excludedIngredients,
						ingredientSubstitutions: meal.ingredientSubstitutions
					});
					mealStore.loadMeals();
				}
				break;
			}
			
			case 'update': {
				const currentMeal = await DatabaseService.getMeal(meal.id!);
				if (!currentMeal || meal.createdAt >= currentMeal.createdAt) {
					await DatabaseService.updateMeal(meal.id!, {
						recipeId: meal.recipeId,
						scheduledDate: meal.scheduledDate,
						duration: meal.duration,
						excludedIngredients: meal.excludedIngredients,
						ingredientSubstitutions: meal.ingredientSubstitutions
					});
					mealStore.loadMeals();
				}
				break;
			}
			
			case 'delete':
				await DatabaseService.deleteMeal(meal.id!);
				mealStore.loadMeals();
				break;
		}
	},

	// Handle shopping list sync operations
	async handleShoppingSync(message: SyncMessage, operation: 'clear') {
		switch (operation) {
			case 'clear':
				await DatabaseService.clearShoppingList();
				shoppingStore.loadShoppingList();
				break;
		}
	},

	// Merge recipes with conflict resolution
	async mergeRecipes(remoteRecipes: Recipe[]) {
		const localRecipes = await DatabaseService.getAllRecipes();
		const localRecipeMap = new Map(localRecipes.map(r => [r.id!, r]));

		for (const remoteRecipe of remoteRecipes) {
			const localRecipe = localRecipeMap.get(remoteRecipe.id!);
			
			if (!localRecipe) {
				// Recipe doesn't exist locally - create it
				await DatabaseService.createRecipe({
					name: remoteRecipe.name,
					description: remoteRecipe.description,
					ingredients: remoteRecipe.ingredients,
					instructions: remoteRecipe.instructions,
					servings: remoteRecipe.servings,
					defaultDuration: remoteRecipe.defaultDuration,
					tags: remoteRecipe.tags,
					category: remoteRecipe.category,
					prepTime: remoteRecipe.prepTime,
					cookTime: remoteRecipe.cookTime
				});
			} else if (remoteRecipe.updatedAt > localRecipe.updatedAt) {
				// Remote version is newer - update local
				await DatabaseService.updateRecipe(remoteRecipe.id!, {
					name: remoteRecipe.name,
					description: remoteRecipe.description,
					ingredients: remoteRecipe.ingredients,
					instructions: remoteRecipe.instructions,
					servings: remoteRecipe.servings,
					defaultDuration: remoteRecipe.defaultDuration,
					tags: remoteRecipe.tags,
					category: remoteRecipe.category,
					prepTime: remoteRecipe.prepTime,
					cookTime: remoteRecipe.cookTime,
					updatedAt: remoteRecipe.updatedAt
				});
			}
		}
	},

	// Merge meals with conflict resolution
	async mergeMeals(remoteMeals: Meal[]) {
		const localMeals = await DatabaseService.getAllMeals();
		const localMealMap = new Map(localMeals.map(m => [m.id!, m]));

		for (const remoteMeal of remoteMeals) {
			const localMeal = localMealMap.get(remoteMeal.id!);
			
			if (!localMeal) {
				// Meal doesn't exist locally - create it if recipe exists
				const recipeExists = await DatabaseService.getRecipe(remoteMeal.recipeId);
				if (recipeExists) {
					await DatabaseService.createMeal({
						recipeId: remoteMeal.recipeId,
						scheduledDate: remoteMeal.scheduledDate,
						duration: remoteMeal.duration,
						excludedIngredients: remoteMeal.excludedIngredients,
						ingredientSubstitutions: remoteMeal.ingredientSubstitutions
					});
				}
			} else if (remoteMeal.createdAt > localMeal.createdAt) {
				// Remote version is newer - update local
				await DatabaseService.updateMeal(remoteMeal.id!, {
					recipeId: remoteMeal.recipeId,
					scheduledDate: remoteMeal.scheduledDate,
					duration: remoteMeal.duration,
					excludedIngredients: remoteMeal.excludedIngredients,
					ingredientSubstitutions: remoteMeal.ingredientSubstitutions
				});
			}
		}
	},

	// Broadcast changes to peer
	async broadcastRecipeCreate(recipe: Recipe) {
		if (syncService.isConnected()) {
			await syncService.sendMessage('recipe_create', recipe);
		}
	},

	async broadcastRecipeUpdate(recipe: Recipe) {
		if (syncService.isConnected()) {
			await syncService.sendMessage('recipe_update', recipe);
		}
	},

	async broadcastRecipeDelete(recipe: Recipe) {
		if (syncService.isConnected()) {
			await syncService.sendMessage('recipe_delete', recipe);
		}
	},

	async broadcastMealCreate(meal: Meal) {
		if (syncService.isConnected()) {
			await syncService.sendMessage('meal_create', meal);
		}
	},

	async broadcastMealUpdate(meal: Meal) {
		if (syncService.isConnected()) {
			await syncService.sendMessage('meal_update', meal);
		}
	},

	async broadcastMealDelete(meal: Meal) {
		if (syncService.isConnected()) {
			await syncService.sendMessage('meal_delete', meal);
		}
	},

	async broadcastShoppingClear() {
		if (syncService.isConnected()) {
			await syncService.sendMessage('shopping_clear');
		}
	},

	// Clear error
	clearError() {
		update(store => ({ ...store, error: null }));
	}
};

// Derived stores for computed values
export const connectionStatus = derived(
	syncStore,
	($syncStore) => ({
		isConnected: $syncStore.connectionState === 'connected',
		isConnecting: $syncStore.connectionState === 'connecting',
		hasError: $syncStore.connectionState === 'error',
		displayState: $syncStore.connectionState,
		remotePeerId: $syncStore.remotePeerId,
		localPeerId: $syncStore.localPeerId
	})
);

export const syncStats = derived(
	syncStore,
	($syncStore) => ({
		lastSyncTime: $syncStore.lastSyncTime,
		lastSyncAgo: $syncStore.lastSyncTime 
			? Date.now() - $syncStore.lastSyncTime 
			: null,
		isHost: $syncStore.isHost,
		hasActiveConnection: $syncStore.connectionState === 'connected',
		syncInProgress: $syncStore.syncInProgress
	})
);

// Initialize sync store when module loads (client-side only)
if (typeof window !== 'undefined') {
	syncStore.initialize();
}