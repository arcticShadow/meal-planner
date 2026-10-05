#!/usr/bin/env node
/**
 * Recompress the scanned recipe-card images into something an app can ship.
 *
 * The originals are ~2800px JPEG scans averaging 550KB, 203MB for the set —
 * fine as an archive, impossible to serve. Each one becomes up to three WebP
 * derivatives sized for where it is actually used, which lands the whole set
 * around 30MB.
 *
 * The first image of a recipe is the card's front: a photo of the dish. It
 * becomes a grid thumbnail and a header image. The second is the back of the
 * card — the printed ingredients and method — which is only worth keeping if
 * the text stays readable, so it gets more pixels and a higher quality than
 * the photo does.
 *
 *   node tools/dataset/images.mjs <raw-jpg-dir> <pack.json> <out-dir>
 *
 * Rewrites the pack in place so each recipe points at its derivatives.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';

/**
 * Derivative sizes.
 *
 * `thumb` is deliberately small: the library renders 227 of them at once, and
 * a grid that costs 14MB to scroll is not a grid anyone will scroll.
 */
const VARIANTS = {
	thumb: { width: 400, quality: 64 },
	// The header image is decorative and never renders wider than ~760px, so
	// it is sized for a 2x phone rather than for the largest display that
	// might ever open it. At 1000px it was the biggest thing in the repo.
	hero: { width: 840, quality: 68 },
	// Text, not a photo. Smaller than the original but large enough to read.
	card: { width: 1500, quality: 74 }
};

/**
 * Index the source directory by a loose key.
 *
 * The pack records the filenames as the extractor saw them, which include
 * spaces, parentheses and accented characters ("… ragù …", "Scanned (2)").
 * Anything that has copied those files since may have rewritten the awkward
 * characters, so matching on the exact string loses images that are present.
 */
function indexSources(dir) {
	const index = new Map();
	for (const file of readdirSync(dir)) {
		index.set(looseKey(file), join(dir, file));
	}
	return index;
}

function looseKey(filename) {
	return (
		basename(filename)
			.normalize('NFD')
			// Strip combining accents so "ragù" and "ragu" agree.
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/\.(jpe?g|png|webp)$/i, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
	);
}

function slug(filename) {
	return looseKey(filename).replace(/-page-?\d+$/, '');
}

/**
 * Find where the card's branding panel ends and the photograph begins.
 *
 * Two-page cards put a near-white panel down the left — logo, title, cooking
 * time, nutrition table — and the dish photo to its right. Using the whole
 * scan as a grid thumbnail spends most of the tile on that panel, which
 * repeats the title the app already prints beside it.
 *
 * The single-page files in the set are photographs with no panel at all, so
 * the boundary is measured per image rather than assumed: scan column
 * brightness across the middle band and find how far the bright run extends
 * from the left edge.
 *
 * Returns the x fraction to crop from, or 0 when there is no panel.
 */
async function panelEdge(sourcePath) {
	const COLUMNS = 120;
	const ROWS = 60;

	// greyscale() collapses the colour but still emits three channels, so read
	// the real channel count back rather than assuming one byte per pixel.
	const { data, info } = await sharp(sourcePath)
		// Ignore the top and bottom, where a photo may run full width behind
		// the panel, and where scanner shadow collects.
		.extract(await middleBand(sourcePath))
		.resize({ width: COLUMNS, height: ROWS, fit: 'fill' })
		.greyscale()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const stride = info.channels;
	const columnMean = [];
	for (let x = 0; x < info.width; x++) {
		let sum = 0;
		for (let y = 0; y < info.height; y++) sum += data[(y * info.width + x) * stride];
		columnMean.push(sum / info.height);
	}

	// Split the columns at the point that best separates bright from dark,
	// rather than at a fixed threshold. Thresholding is brittle here: the
	// panel carries a title and a nutrition table, so scanning left-to-right
	// for the first dark column stops at the first letter, and demanding the
	// left stay mostly-bright trips on the same text.
	const total = columnMean.length;
	const mean = (from, to) => {
		let sum = 0;
		for (let i = from; i < to; i++) sum += columnMean[i];
		return sum / (to - from);
	};

	let best = { edge: 0, left: 0, gap: -Infinity };
	// A panel occupies a real share of the card: narrower than this is just a
	// scan margin, wider and we would be cutting into the photo.
	for (let edge = Math.floor(total * 0.15); edge <= Math.floor(total * 0.5); edge++) {
		const left = mean(0, edge);
		const gap = left - mean(edge, total);
		if (gap > best.gap) best = { edge, left, gap };
	}

	// Paper under a scanner sits well above 200, and the photo beside it is
	// markedly darker. Both must hold, or this is a photo with no panel.
	const isPanel = best.left > 195 && best.gap > 25;
	return isPanel ? best.edge / total : 0;
}

async function middleBand(sourcePath) {
	const { width, height } = await sharp(sourcePath).metadata();
	return {
		left: 0,
		top: Math.round(height * 0.25),
		width,
		height: Math.round(height * 0.45)
	};
}

async function emit(sourcePath, outDir, variant, name, cropFrom = 0) {
	const spec = VARIANTS[variant];
	const dir = join(outDir, variant);
	mkdirSync(dir, { recursive: true });
	const out = join(dir, `${name}.webp`);

	// Skip work already done, so a re-run after adding a few cards is quick.
	if (existsSync(out) && statSync(out).mtimeMs > statSync(sourcePath).mtimeMs) {
		return { path: `${variant}/${name}.webp`, bytes: statSync(out).size, skipped: true };
	}

	let pipeline = sharp(sourcePath);
	if (cropFrom > 0) {
		const { width, height } = await pipeline.metadata();
		const left = Math.round(width * cropFrom);
		pipeline = sharp(sourcePath).extract({ left, top: 0, width: width - left, height });
	}

	const info = await pipeline
		// `withoutEnlargement` keeps a small original from being upscaled into
		// a file bigger than the thing it came from.
		.resize({ width: spec.width, withoutEnlargement: true })
		.webp({ quality: spec.quality })
		.toFile(out);

	return { path: `${variant}/${name}.webp`, bytes: info.size, skipped: false };
}

async function main() {
	const [rawDir, packPath, outDir] = process.argv.slice(2);
	if (!rawDir || !packPath || !outDir) {
		console.error('usage: images.mjs <raw-jpg-dir> <pack.json> <out-dir>');
		process.exit(1);
	}

	const pack = JSON.parse(readFileSync(packPath, 'utf8'));
	const sourceIndex = indexSources(rawDir);
	let written = 0;
	let bytes = 0;
	let missing = 0;
	let cropped = 0;

	for (const recipe of pack.recipes) {
		// Before this runs the pack carries the original filenames; after it,
		// the derivatives. Accept either so the script is re-runnable.
		const sources = Array.isArray(recipe.images)
			? recipe.images.map((i) => i.src).filter(Boolean)
			: [];
		if (!sources.length) continue;

		const images = {};
		const [front, back] = sources;

		const frontPath = sourceIndex.get(looseKey(front));
		if (frontPath) {
			const name = slug(front);
			// Crop the branding panel off the photo variants only; the scanned
			// card on the back is a document and must stay whole.
			const cropFrom = await panelEdge(frontPath);
			if (cropFrom > 0) cropped++;
			for (const variant of ['thumb', 'hero']) {
				const r = await emit(frontPath, outDir, variant, name, cropFrom);
				images[variant] = r.path;
				bytes += r.bytes;
				if (!r.skipped) written++;
			}
		} else {
			missing++;
		}

		if (back) {
			const backPath = sourceIndex.get(looseKey(back));
			if (backPath) {
				const r = await emit(backPath, outDir, 'card', slug(back));
				images.card = r.path;
				bytes += r.bytes;
				if (!r.skipped) written++;
			} else {
				missing++;
			}
		}

		recipe.images = images;
	}

	writeFileSync(packPath, JSON.stringify(pack, null, '\t') + '\n');

	const withImages = pack.recipes.filter((r) => r.images?.thumb).length;
	console.log(`wrote ${written} files into ${outDir}`);
	console.log(`  recipes with a photo   ${withImages} of ${pack.recipes.length}`);
	console.log(`  recipes with the card  ${pack.recipes.filter((r) => r.images?.card).length}`);
	console.log(`  branding panel cropped ${cropped}`);
	console.log(`  missing sources        ${missing}`);
	console.log(`  total size             ${(bytes / 1048576).toFixed(1)} MB`);
}

main();
