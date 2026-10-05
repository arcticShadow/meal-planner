<script lang="ts">
	import { base } from '$app/paths';
	import type { RecipeImages } from '$lib/types';

	/**
	 * A recipe photo, or a placeholder when there is not one.
	 *
	 * Imported packs carry image paths relative to the pack's image directory;
	 * hand-written recipes carry none, and a plan shared by link deliberately
	 * drops them. Every caller therefore has to cope with an absent image, so
	 * that case is handled here once.
	 */
	let {
		images,
		variant = 'thumb',
		alt = '',
		eager = false
	}: {
		images: RecipeImages | undefined;
		variant?: 'thumb' | 'hero' | 'card';
		alt?: string;
		eager?: boolean;
	} = $props();

	// `base`, not `asset()`: these paths are data from a pack, so they are not
	// in the set of build-time assets that asset() is typed against.
	const src = $derived(images?.[variant] ? `${base}/recipe-images/${images[variant]}` : null);
</script>

{#if src}
	<img
		{src}
		{alt}
		class={variant}
		loading={eager ? 'eager' : 'lazy'}
		decoding="async"
		fetchpriority={eager ? 'high' : 'auto'}
	/>
{:else}
	<!-- Not an error state, so it stays quiet: a flat tile in the page's own
	     colours rather than a broken-image icon or a missing-asset message. -->
	<div class="placeholder {variant}" aria-hidden="true"></div>
{/if}

<style>
	img,
	.placeholder {
		width: 100%;
		display: block;
		background: var(--surface-sunk);
	}

	.thumb {
		aspect-ratio: 4 / 3;
		object-fit: cover;
	}

	.hero {
		aspect-ratio: 16 / 10;
		object-fit: cover;
	}

	/* The scanned card is a document, not a picture: it must not be cropped,
	   and its own proportions are the right ones. */
	.card {
		height: auto;
		object-fit: contain;
	}
</style>
