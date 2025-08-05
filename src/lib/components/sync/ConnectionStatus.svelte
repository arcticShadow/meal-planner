<script lang="ts">
	import { connectionStatus, syncStats } from '../../stores/sync.js';
	import { formatDistanceToNow } from 'date-fns';

	// Props
	export let compact = false;
	export let showDetails = true;

	// Store subscriptions
	$: status = $connectionStatus;
	$: stats = $syncStats;

	// Format last sync time with null check
	$: lastSyncText = stats?.lastSyncTime
		? formatDistanceToNow(new Date(stats.lastSyncTime), { addSuffix: true })
		: null;

	// Connection status icon and color
	$: statusIcon = getStatusIcon(status?.displayState || 'disconnected');
	$: statusColor = getStatusColor(status?.displayState || 'disconnected');

	function getStatusIcon(state: string): string {
		switch (state) {
			case 'connected': return '✓';
			case 'connecting': return '⏳';
			case 'error': return '⚠';
			default: return '○';
		}
	}

	function getStatusColor(state: string): string {
		switch (state) {
			case 'connected': return '#27ae60';
			case 'connecting': return '#f39c12';
			case 'error': return '#e74c3c';
			default: return '#606c76';
		}
	}

	function getStatusText(state: string): string {
		switch (state) {
			case 'connected': return 'Connected';
			case 'connecting': return 'Connecting';
			case 'error': return 'Error';
			default: return 'Disconnected';
		}
	}
</script>

{#if compact}
	<!-- Compact status indicator for navigation -->
	<div class="status-compact" style="color: {statusColor}">
		<span class="status-icon" title={getStatusText(status?.displayState || 'disconnected')}>
			{statusIcon}
		</span>
		{#if status?.isConnected && stats?.syncInProgress}
			<span class="sync-indicator" title="Syncing...">↻</span>
		{/if}
	</div>
{:else}
	<!-- Full status display -->
	<div class="status-full">
		<div class="status-header">
			<span class="status-icon" style="color: {statusColor}">
				{statusIcon}
			</span>
			<span class="status-text" style="color: {statusColor}">
				{getStatusText(status?.displayState || 'disconnected')}
			</span>
			{#if stats?.syncInProgress}
				<span class="sync-indicator" title="Syncing...">↻</span>
			{/if}
		</div>

		{#if showDetails}
			{#if status?.isConnected}
				<div class="status-details">
					{#if status?.remotePeerId}
						<div class="detail-item">
							<span class="detail-label">Peer:</span>
							<span class="detail-value">{status?.remotePeerId?.slice(0, 8) || 'Unknown'}...</span>
						</div>
					{/if}
					{#if stats?.isHost}
						<div class="detail-item">
							<span class="detail-label">Role:</span>
							<span class="detail-value">Host</span>
						</div>
					{/if}
					{#if lastSyncText}
						<div class="detail-item">
							<span class="detail-label">Last sync:</span>
							<span class="detail-value">{lastSyncText}</span>
						</div>
					{/if}
				</div>
			{:else if status?.displayState === 'error'}
				<div class="status-details">
					<div class="detail-item error-text">
						Connection failed. Check your internet connection.
					</div>
				</div>
			{:else if status?.displayState === 'connecting'}
				<div class="status-details">
					<div class="detail-item">
						Establishing peer-to-peer connection...
					</div>
				</div>
			{:else}
				<div class="status-details">
					<div class="detail-item">
						No active collaboration session
					</div>
				</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.status-compact {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 1.2em;
	}

	.status-icon {
		display: inline-block;
		font-weight: bold;
	}

	.sync-indicator {
		display: inline-block;
		animation: spin 1s linear infinite;
		font-size: 0.9em;
		color: #9b4dca;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.status-full {
		padding: 1rem;
		border: 1px solid #e1e1e1;
		border-radius: 4px;
		background: #fafafa;
	}

	.status-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-weight: 600;
	}

	.status-text {
		font-size: 1.1em;
	}

	.status-details {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid #e1e1e1;
	}

	.detail-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.9em;
	}

	.detail-item:last-child {
		margin-bottom: 0;
	}

	.detail-label {
		color: #606c76;
		font-weight: 500;
	}

	.detail-value {
		color: #2c3e50;
		font-family: monospace;
	}

	.error-text {
		color: #e74c3c;
		font-style: italic;
	}

	/* Responsive adjustments */
	@media (max-width: 40rem) {
		.status-full {
			padding: 0.75rem;
		}

		.detail-item {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
		}

		.detail-label {
			font-size: 0.8em;
		}
	}
</style>