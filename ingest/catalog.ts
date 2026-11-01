import { catalogItemSchema, type CatalogItem, type HostState } from '../src/lib/catalog.ts';
import { CHILDRENS } from '../src/lib/kids.ts';
import type { Museum } from '../src/lib/museums.ts';
import { garmentOf } from './classify.ts';
import { HostBlockedError, type Crawler } from './crawler.ts';
import { sizesOf } from './sizes.ts';
import { ParseError, parseCollectionPage, parseProductPage, type ProductPage } from './shopify.ts';

const MAX_COLLECTION_PAGES = 40;
// A crawl that finds fewer than this share of last week's items is treated as broken.
const MIN_COUNT_RATIO = 0.8;
// Shopify sitemaps stamp every product with the sitemap's build time, so they cannot say what
// changed. Catalog pieces are reread every run; pages found not to be clothing wait this long.
const RECHECK_SKIPPED_MS = 28 * 24 * 60 * 60 * 1000;

export function toItem(
	museum: string,
	origin: string,
	handle: string,
	page: ProductPage,
	previous: CatalogItem | undefined,
	now: string,
): CatalogItem | undefined {
	const garment = garmentOf(page.name);
	if (!garment || page.variants.length === 0) return undefined;
	const prices = page.variants.map((v) => v.price);
	const compareAt = Math.max(0, ...page.variants.map((v) => v.compareAt ?? 0));
	const sizes = sizesOf(page.variants, CHILDRENS.test(page.name));
	return catalogItemSchema.parse({
		id: `${museum}:${page.id}`,
		museum,
		handle,
		url: `${origin}/products/${handle}`,
		name: page.name,
		garment,
		price: { min: Math.min(...prices), max: Math.max(...prices), compareAt: compareAt || undefined },
		sizes,
		available: sizes.some((s) => s.available),
		productType: page.productType,
		tags: page.tags,
		firstSeen: previous?.firstSeen ?? now,
		checkedAt: now,
	});
}

async function readCollections(crawler: Crawler, origin: string, collections: string[]): Promise<string[]> {
	const handles = new Set<string>();
	for (const collection of collections) {
		let next: string | undefined = `${origin}/collections/${collection}`;
		for (let page = 0; next && page < MAX_COLLECTION_PAGES; page++) {
			const response = await crawler.get(next);
			if (response.status !== 200) throw new Error(`${next} answered ${response.status}`);
			const parsed = parseCollectionPage(response.body, next);
			parsed.handles.forEach((h) => handles.add(h));
			next = parsed.next;
		}
	}
	return [...handles];
}

export interface MuseumCrawl {
	items: CatalogItem[];
	host: HostState;
}

export async function crawlMuseum(
	crawler: Crawler,
	museum: Museum,
	previous: CatalogItem[],
	previousHost: HostState | undefined,
	// refresh: recheck skipped pages too, e.g. after the classifier changes.
	// removed: pieces taken down (data/removals.yaml). Their handles are never fetched; the id check
	// after a fetch catches a piece that moved to a new handle.
	options: {
		now: string;
		limit?: number;
		refresh?: boolean;
		removed?: { ids: Set<string>; handles: Set<string> };
	},
): Promise<MuseumCrawl> {
	const removed = options.removed?.ids ?? new Set<string>();
	const removedHandles = new Set([
		...(options.removed?.handles ?? []),
		...previous.filter((i) => removed.has(i.id)).map((i) => i.handle),
	]);
	if (previous.some((i) => removed.has(i.id))) previous = previous.filter((i) => !removed.has(i.id));
	const origin = new URL(museum.storeUrl).origin;
	const startRequests = crawler.requests.length;
	const host = (status: HostState['status'], items: number, extra: Partial<HostState> = {}): HostState => ({
		lastAttempt: options.now,
		lastSuccess: previousHost?.lastSuccess,
		status,
		requests: crawler.requests.length - startRequests,
		items,
		skipped: previousHost?.skipped ?? {},
		...extra,
	});

	try {
		if (museum.apparelCollections.length === 0) throw new Error('no apparelCollections in museums.yaml');
		const listed = await readCollections(crawler, origin, museum.apparelCollections);
		// Previously indexed pieces stay until their own product page is gone, even if they left the collection.
		const handles = [...new Set([...listed, ...previous.map((i) => i.handle)])];
		const byHandle = new Map(previous.map((i) => [i.handle, i]));
		const oldSkipped = previousHost?.skipped ?? {};
		const skipped: Record<string, string> = {};
		const items: CatalogItem[] = [];
		const skippedRecently = (handle: string) =>
			!options.refresh &&
			oldSkipped[handle] !== undefined &&
			Date.parse(options.now) - Date.parse(oldSkipped[handle]) < RECHECK_SKIPPED_MS;
		let fetched = 0;

		for (const handle of handles) {
			if (removedHandles.has(handle)) continue;
			const old = byHandle.get(handle);
			if (!old && skippedRecently(handle)) {
				skipped[handle] = oldSkipped[handle];
				continue;
			}
			if (options.limit !== undefined && fetched >= options.limit) {
				// Not visited this run: carry over whatever was known.
				if (old) items.push(old);
				if (oldSkipped[handle]) skipped[handle] = oldSkipped[handle];
				continue;
			}
			fetched++;
			let item: CatalogItem | undefined;
			let finalHandle = handle;
			try {
				const page = await crawler.get(`${origin}/products/${encodeURIComponent(handle)}`);
				if (page.status === 404 || page.status === 410) continue;
				if (page.status !== 200) throw new ParseError(`answered ${page.status}`);
				// A renamed product redirects to its new handle; index it there, once.
				finalHandle = decodeURIComponent(new URL(page.url).pathname.replace(/^\/products\//, ''));
				if (finalHandle !== handle && handles.includes(finalHandle)) continue;
				item = toItem(museum.id, origin, finalHandle, parseProductPage(page.body, finalHandle), old, options.now);
			} catch (error) {
				// Throttling ends the shop's crawl; anything wrong with one page only affects that page.
				if (error instanceof HostBlockedError) throw error;
				console.error(`  kept previous ${museum.id}/${handle}: ${error instanceof Error ? error.message : error}`);
				if (old) items.push(old);
				if (oldSkipped[handle]) skipped[handle] = oldSkipped[handle];
				continue;
			}
			if (item && removed.has(item.id)) continue;
			if (item) items.push(item);
			else skipped[finalHandle] = options.now;
		}

		if (previous.length > 0 && items.length < previous.length * MIN_COUNT_RATIO) {
			return {
				items: previous,
				host: host('count-drop', previous.length, { error: `found ${items.length}, had ${previous.length}` }),
			};
		}
		const unique = [...new Map(items.map((i) => [i.id, i])).values()].sort((a, b) => a.id.localeCompare(b.id));
		return { items: unique, host: host('ok', unique.length, { lastSuccess: options.now, skipped }) };
	} catch (error) {
		// Any failure keeps last week's items for this shop; the reason lands in hosts.json.
		const message = error instanceof Error ? error.message : String(error);
		console.error(`  ${museum.id} failed${error instanceof HostBlockedError ? ' (blocked)' : ''}: ${message}`);
		return { items: previous, host: host('error', previous.length, { error: message }) };
	}
}
