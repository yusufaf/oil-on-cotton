import { catalogItemSchema, type CatalogItem, type HostState } from '../src/lib/catalog.ts';
import type { Museum } from '../src/lib/museums.ts';
import { garmentOf } from './classify.ts';
import { HostBlockedError, type Crawler } from './crawler.ts';
import { sizesOf } from './sizes.ts';
import {
	ParseError,
	parseCollectionPage,
	parseProductPage,
	parseProductSitemap,
	parseSitemapIndex,
	type ProductPage,
} from './shopify.ts';

const MAX_COLLECTION_PAGES = 40;
// "Baby Blue" is a colour, not an age.
const CHILDRENS = /\b(kids?|kid['’]s|youth|baby(?! (blue|pink|yellow|green))|babies|toddlers?|infants?|child|children(['’]?s)?)\b/i;
// A crawl that finds fewer than this share of last week's items is treated as broken.
const MIN_COUNT_RATIO = 0.8;

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

async function readLastmod(crawler: Crawler, origin: string): Promise<Map<string, string>> {
	const index = await crawler.get(`${origin}/sitemap.xml`);
	const lastmod = new Map<string, string>();
	if (index.status !== 200) return lastmod;
	for (const url of parseSitemapIndex(index.body, origin)) {
		const sitemap = await crawler.get(url);
		if (sitemap.status === 200) for (const [handle, date] of parseProductSitemap(sitemap.body)) lastmod.set(handle, date);
	}
	return lastmod;
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
	// refresh: ignore sitemap dates and the skip list, e.g. after the parser or classifier changes.
	options: { now: string; limit?: number; refresh?: boolean },
): Promise<MuseumCrawl> {
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
		const lastmod = await readLastmod(crawler, origin);
		const listed = await readCollections(crawler, origin, museum.apparelCollections);
		// Previously indexed pieces stay until their own product page is gone, even if they left the collection.
		const handles = [...new Set([...listed, ...previous.map((i) => i.handle)])];
		const byHandle = new Map(previous.map((i) => [i.handle, i]));
		const oldSkipped = previousHost?.skipped ?? {};
		const skipped: Record<string, string> = {};
		const items: CatalogItem[] = [];
		const unchangedSince = (handle: string, since: string | undefined) => {
			const modified = lastmod.get(handle);
			return !options.refresh && since !== undefined && modified !== undefined && modified <= since;
		};
		let fetched = 0;

		for (const handle of handles) {
			const old = byHandle.get(handle);
			if (old && unchangedSince(handle, old.checkedAt)) {
				items.push(old);
				continue;
			}
			if (unchangedSince(handle, oldSkipped[handle])) {
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
				continue;
			}
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
