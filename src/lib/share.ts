import type { Meal, Recipe } from './types';

/**
 * Plan sharing.
 *
 * This replaces the peer-to-peer sync, which could not work without a
 * signalling server. The observation that makes it unnecessary: two people
 * planning meals together are not editing simultaneously. One person plans,
 * then hands the result over. That is a document, not a session, and a
 * document fits in a link.
 *
 * The payload rides in the URL *fragment*, which browsers never transmit to
 * the server. A shared plan therefore stays private even though the app is
 * hosted on someone else's static host, and the whole thing keeps working
 * with no backend at all.
 */

export interface SharedPlan {
	v: 1;
	/** Who sent it, for the confirmation screen. Free text, optional. */
	by?: string;
	meals: { r: string; d: string; n: number; x?: string[] }[];
	recipes: Recipe[];
}

/** Base64url, so the payload survives a URL without percent-encoding. */
function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
	const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
	const binary = atob(padded);
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function gzip(text: string): Promise<Uint8Array> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<string> {
	const stream = new Blob([bytes as BlobPart])
		.stream()
		.pipeThrough(new DecompressionStream('gzip'));
	return await new Response(stream).text();
}

const hasCompression = () => typeof CompressionStream !== 'undefined';

/**
 * Strip a recipe down to what a recipient needs, which is also what keeps the
 * link short. Images go because they are local filenames from the original
 * scans and resolve to nothing on another device; provenance fields go
 * because they describe how *this* library got the recipe.
 */
function forSharing(recipe: Recipe): Recipe {
	return {
		id: recipe.id,
		name: recipe.name,
		description: recipe.description,
		category: recipe.category,
		tags: recipe.tags,
		servings: recipe.servings,
		defaultDuration: recipe.defaultDuration,
		ingredients: recipe.ingredients,
		instructions: recipe.instructions,
		images: [],
		...(recipe.needsReview ? { needsReview: true } : {})
	};
}

/**
 * Build a shareable payload for the given meals.
 *
 * Recipes travel with the plan so the recipient can shop and cook without
 * already owning the library.
 */
export async function encodePlan(meals: Meal[], recipes: Recipe[], by?: string): Promise<string> {
	const needed = new Set(meals.map((m) => m.recipeId));
	const plan: SharedPlan = {
		v: 1,
		...(by ? { by } : {}),
		meals: meals.map((m) => ({
			r: m.recipeId,
			d: m.date,
			n: m.duration,
			...(m.excluded.length ? { x: m.excluded } : {})
		})),
		recipes: recipes.filter((r) => needed.has(r.id)).map(forSharing)
	};

	const json = JSON.stringify(plan);
	if (!hasCompression()) return 'r' + toBase64Url(new TextEncoder().encode(json));
	return 'z' + toBase64Url(await gzip(json));
}

export async function decodePlan(payload: string): Promise<SharedPlan> {
	const kind = payload[0];
	const body = fromBase64Url(payload.slice(1));

	let json: string;
	if (kind === 'z') json = await gunzip(body);
	else if (kind === 'r') json = new TextDecoder().decode(body);
	else throw new Error('Unrecognised share link');

	const plan = JSON.parse(json) as SharedPlan;
	if (plan.v !== 1) throw new Error(`Share link version ${plan.v} is not supported`);
	if (!Array.isArray(plan.meals) || !Array.isArray(plan.recipes)) {
		throw new Error('Share link is malformed');
	}
	return plan;
}

/** Build the full URL to send. `base` should be the app's /share page. */
export async function planUrl(
	base: string,
	meals: Meal[],
	recipes: Recipe[],
	by?: string
): Promise<string> {
	return `${base}#${await encodePlan(meals, recipes, by)}`;
}

/**
 * The shopping list as plain text, for pasting into a message.
 *
 * A link is better when the other person will open the app; text is better
 * when they just need the list in the conversation they are already in.
 */
export function shoppingListText(
	lines: {
		name: string;
		totals: { amount: number; unit: string | null }[];
		unquantified: string[];
		checked: boolean;
	}[],
	format: (amount: number, unit: never) => string
): string {
	return lines
		.filter((l) => !l.checked)
		.map((l) => {
			const qty =
				l.totals.map((t) => format(t.amount, t.unit as never)).join(' + ') ||
				l.unquantified.join(', ');
			return qty ? `- ${qty} ${l.name}` : `- ${l.name}`;
		})
		.join('\n');
}
