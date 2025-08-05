<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { format } from 'date-fns';
	import { DataExportService, type ImportResult } from '$lib/services/dataExport.js';
	import { DatabaseService } from '$lib/services/database.js';

	const dispatch = createEventDispatcher<{
		exported: { success: boolean };
		imported: { result: ImportResult };
		error: { message: string };
	}>();

	// Local state
	let isExporting = false;
	let isImporting = false;
	let importFile: File | null = null;
	let importFileInfo: any = null;
	let showImportOptions = false;
	let importOptions = {
		clearExisting: false,
		skipDuplicates: true
	};
	let dbStats = {
		recipes: 0,
		meals: 0,
		shoppingListItems: 0
	};

	// Load database stats on mount
	async function loadStats() {
		try {
			dbStats = await DatabaseService.getDatabaseStats();
		} catch (error) {
			console.error('Failed to load database stats:', error);
		}
	}

	// Call loadStats when component mounts
	loadStats();

	async function exportData() {
		if (dbStats.recipes === 0 && dbStats.meals === 0) {
			dispatch('error', { message: 'No data to export. Add some recipes and meals first.' });
			return;
		}

		isExporting = true;
		try {
			await DataExportService.exportToFile();
			dispatch('exported', { success: true });
		} catch (error) {
			dispatch('error', { 
				message: error instanceof Error ? error.message : 'Failed to export data'
			});
		} finally {
			isExporting = false;
		}
	}

	async function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		
		if (!file) return;

		importFile = file;
		showImportOptions = false;
		importFileInfo = null;

		try {
			const info = await DataExportService.getExportInfo(file);
			if (info.isValid && info.info) {
				importFileInfo = info.info;
				showImportOptions = true;
			} else {
				dispatch('error', { 
					message: `Invalid import file: ${info.errors.join(', ')}`
				});
				importFile = null;
			}
		} catch (error) {
			dispatch('error', { 
				message: error instanceof Error ? error.message : 'Failed to read import file'
			});
			importFile = null;
		}
	}

	async function importData() {
		if (!importFile) return;

		isImporting = true;
		try {
			const result = await DataExportService.importFromFile(importFile, importOptions);
			dispatch('imported', { result });
			
			// Refresh stats after import
			await loadStats();
			
			// Reset form
			importFile = null;
			importFileInfo = null;
			showImportOptions = false;
			
			// Clear file input
			const fileInput = document.getElementById('import-file') as HTMLInputElement;
			if (fileInput) fileInput.value = '';
			
		} catch (error) {
			dispatch('error', { 
				message: error instanceof Error ? error.message : 'Failed to import data'
			});
		} finally {
			isImporting = false;
		}
	}

	function cancelImport() {
		importFile = null;
		importFileInfo = null;
		showImportOptions = false;
		
		// Clear file input
		const fileInput = document.getElementById('import-file') as HTMLInputElement;
		if (fileInput) fileInput.value = '';
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function formatDate(dateString: string): string {
		try {
			return format(new Date(dateString), 'PPP');
		} catch {
			return dateString;
		}
	}
</script>

<div class="data-management">
	<div class="management-header">
		<h3>Data Management</h3>
		<p>Export your data for backup or import from another device</p>
	</div>

	<!-- Database Statistics -->
	<div class="stats-section">
		<h4>Current Database</h4>
		<div class="stats-grid">
			<div class="stat-item">
				<span class="stat-number">{dbStats.recipes}</span>
				<span class="stat-label">Recipes</span>
			</div>
			<div class="stat-item">
				<span class="stat-number">{dbStats.meals}</span>
				<span class="stat-label">Planned Meals</span>
			</div>
			<div class="stat-item">
				<span class="stat-number">{dbStats.shoppingListItems}</span>
				<span class="stat-label">Shopping Items</span>
			</div>
		</div>
	</div>

	<!-- Export Section -->
	<div class="export-section">
		<h4>Export Data</h4>
		<p>Download all your recipes, meals, and settings as a backup file.</p>
		<button 
			class="button"
			on:click={exportData}
			disabled={isExporting || (dbStats.recipes === 0 && dbStats.meals === 0)}
		>
			{#if isExporting}
				Exporting...
			{:else}
				Export Data
			{/if}
		</button>
	</div>

	<!-- Import Section -->
	<div class="import-section">
		<h4>Import Data</h4>
		<p>Restore data from a backup file or import from another device.</p>
		
		<div class="file-input-container">
			<input 
				type="file" 
				id="import-file"
				accept=".json"
				on:change={handleFileSelect}
				disabled={isImporting}
			/>
			<label for="import-file" class="file-input-label">
				{importFile ? importFile.name : 'Choose backup file...'}
			</label>
		</div>

		{#if showImportOptions && importFileInfo}
			<div class="import-options">
				<div class="file-info">
					<h5>Import Preview</h5>
					<div class="info-grid">
						<div class="info-item">
							<span class="info-label">Export Date:</span>
							<span class="info-value">{formatDate(importFileInfo.exportDate)}</span>
						</div>
						<div class="info-item">
							<span class="info-label">File Size:</span>
							<span class="info-value">{formatFileSize(importFileInfo.fileSize)}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Recipes:</span>
							<span class="info-value">{importFileInfo.recipeCount}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Meals:</span>
							<span class="info-value">{importFileInfo.mealCount}</span>
						</div>
					</div>
				</div>

				<div class="import-settings">
					<h5>Import Options</h5>
					<label class="checkbox-label">
						<input 
							type="checkbox" 
							bind:checked={importOptions.clearExisting}
							disabled={isImporting}
						/>
						<span class="checkmark"></span>
						Clear existing data before import
						<small>⚠️ This will permanently delete all current data</small>
					</label>
					
					<label class="checkbox-label">
						<input 
							type="checkbox" 
							bind:checked={importOptions.skipDuplicates}
							disabled={isImporting || importOptions.clearExisting}
						/>
						<span class="checkmark"></span>
						Skip duplicate recipes and meals
						<small>Keep existing items with the same name/date</small>
					</label>
				</div>

				<div class="import-actions">
					<button 
						class="button button-outline"
						on:click={cancelImport}
						disabled={isImporting}
					>
						Cancel
					</button>
					<button 
						class="button"
						on:click={importData}
						disabled={isImporting}
					>
						{#if isImporting}
							Importing...
						{:else}
							Import Data
						{/if}
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.data-management {
		background: white;
		border: 0.1rem solid #e1e1e1;
		border-radius: 0.4rem;
		padding: 2rem;
		max-width: 600px;
		margin: 0 auto;
	}

	.management-header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.management-header h3 {
		margin-bottom: 0.5rem;
		color: #2c3e50;
	}

	.management-header p {
		color: #606c76;
		font-size: 1.4rem;
	}

	.stats-section,
	.export-section,
	.import-section {
		margin-bottom: 3rem;
		padding-bottom: 2rem;
		border-bottom: 0.1rem solid #e1e1e1;
	}

	.stats-section:last-child,
	.export-section:last-child,
	.import-section:last-child {
		border-bottom: none;
		margin-bottom: 0;
	}

	.stats-section h4,
	.export-section h4,
	.import-section h4 {
		margin-bottom: 1rem;
		color: #2c3e50;
		font-size: 1.6rem;
	}

	.stats-section p,
	.export-section p,
	.import-section p {
		color: #606c76;
		margin-bottom: 1.5rem;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5rem;
	}

	.stat-item {
		text-align: center;
		padding: 1.5rem;
		background: #f8f9fa;
		border-radius: 0.4rem;
		border: 0.1rem solid #e1e1e1;
	}

	.stat-number {
		display: block;
		font-size: 2.4rem;
		font-weight: 600;
		color: #9b4dca;
		margin-bottom: 0.5rem;
	}

	.stat-label {
		font-size: 1.2rem;
		color: #606c76;
	}

	.file-input-container {
		position: relative;
		margin-bottom: 2rem;
	}

	.file-input-container input[type="file"] {
		position: absolute;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}

	.file-input-label {
		display: block;
		padding: 1rem 1.5rem;
		background: #f8f9fa;
		border: 0.2rem dashed #d1d1d1;
		border-radius: 0.4rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s ease;
		color: #606c76;
	}

	.file-input-label:hover {
		background: #e9ecef;
		border-color: #9b4dca;
	}

	.import-options {
		background: #f8f9fa;
		border-radius: 0.4rem;
		padding: 2rem;
		margin-top: 1.5rem;
	}

	.file-info h5,
	.import-settings h5 {
		margin-bottom: 1.5rem;
		color: #2c3e50;
		font-size: 1.4rem;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.info-item {
		display: flex;
		justify-content: space-between;
	}

	.info-label {
		font-weight: 600;
		color: #2c3e50;
	}

	.info-value {
		color: #606c76;
	}

	.checkbox-label {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1.5rem;
		cursor: pointer;
		position: relative;
	}

	.checkbox-label input[type="checkbox"] {
		width: 1.8rem;
		height: 1.8rem;
		margin: 0;
	}

	.checkbox-label small {
		display: block;
		color: #606c76;
		font-size: 1.1rem;
		margin-top: 0.2rem;
	}

	.import-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		margin-top: 2rem;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.data-management {
			padding: 1.5rem;
		}

		.stats-grid {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.info-grid {
			grid-template-columns: 1fr;
		}

		.import-actions {
			flex-direction: column;
		}
	}

	@media (max-width: 40rem) {
		.management-header {
			margin-bottom: 2rem;
		}

		.stats-section,
		.export-section,
		.import-section {
			margin-bottom: 2rem;
			padding-bottom: 1.5rem;
		}
	}
</style>