import { describe, expect, it } from 'vitest';
import { isRuntimeCached, shouldPrecache } from './precache';

describe('precache selection', () => {
	it('precaches the app shell', () => {
		for (const path of [
			'/meal-planner/_app/immutable/entry/app.DV4lqBFu.js',
			'/meal-planner/_app/immutable/assets/0.CvKP_ftj.css',
			'/meal-planner/404.html'
		]) {
			expect(shouldPrecache(path)).toBe(true);
		}
	});

	it('precaches the recipe packs, which offline use depends on', () => {
		expect(shouldPrecache('/meal-planner/packs/recipe-cards.json')).toBe(true);
	});

	it('never precaches recipe photos', () => {
		// ~40MB of images. Precaching them would spend a first-time visitor's
		// mobile data on pictures they may never scroll to.
		for (const path of [
			'/meal-planner/recipe-images/thumb/american-hotdogs.webp',
			'/meal-planner/recipe-images/hero/american-hotdogs.webp',
			'/meal-planner/recipe-images/card/american-hotdogs.webp',
			'/recipe-images/thumb/x.webp'
		]) {
			expect(shouldPrecache(path)).toBe(false);
			expect(isRuntimeCached(path)).toBe(true);
		}
	});

	it('keeps the two sets disjoint', () => {
		for (const path of ['/a/_app/x.js', '/a/recipe-images/thumb/x.webp', '/a/packs/p.json']) {
			expect(shouldPrecache(path)).toBe(!isRuntimeCached(path));
		}
	});
});
