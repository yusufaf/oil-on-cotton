import { catalogItemSchema, type CatalogItem, type HostState } from '../src/lib/catalog.ts';
import type { Work } from '../src/lib/curation.ts';
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

export interface Gone {
	id: string;
	handle: string;
	reason: string;
}

// Every row in `base` (main's catalog) that `next` lacks, with this crawl's reason when it has one.
// A data PR left open builds on itself, so rows dropped in its earlier weeks are named here too.
export function leftSince(base: CatalogItem[], next: CatalogItem[], gone: Gone[], takenDown: Set<string>): Gone[] {
	const known = new Set([...next, ...gone].map((r) => r.id));
	return [
		...new Map(gone.map((g) => [g.id, g])).values(),
		...base
			.filter((r) => !known.has(r.id))
			.map((r) => ({
				id: r.id,
				handle: r.handle,
				reason: takenDown.has(r.id) ? 'taken down in data/removals.yaml' : 'left in an earlier crawl of this data PR',
			})),
	].sort((a, b) => a.id.localeCompare(b.id));
}

// The data PR body's list of the rows it removes, and of the hung pieces among them.
export function goneReport(gone: Gone[], works: Pick<Work, 'id' | 'pieces'>[]): string {
	if (gone.length === 0) return 'This data PR removes no rows from the catalog.\n';
	const ids = new Set(gone.map((g) => g.id));
	const hung = works.flatMap((w) => w.pieces.filter((p) => ids.has(p.id)).map((p) => `- ${w.id}: ${p.id} (${p.label})`));
	const lines = ['Rows this data PR removes from the catalog:', '', ...gone.map((g) => `- ${g.id} \`${g.handle}\`: ${g.reason}`)];
	if (hung.length > 0) lines.push('', 'Hung pieces among them, which leave their labels:', '', ...hung);
	return lines.join('\n') + '\n';
}

const byKey = <T>(record: Record<string, T>): Record<string, T> =>
	Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));

// Sorted throughout, so a data PR's diff of hosts.json shows only what changed.
export function hostsFile(hosts: Record<string, HostState>): string {
	const sorted = Object.entries(byKey(hosts)).map(([id, host]) => [id, { ...host, skipped: byKey(host.skipped) }]);
	return JSON.stringify(Object.fromEntries(sorted), null, '\t') + '\n';
}

export interface MuseumCrawl {
	items: CatalogItem[];
	host: HostState;
	gone: Gone[];
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
		// Previously indexed pieces stay until their own product page is gone, or fails on two crawls in a
		// row, even if they left the collection.
		const handles = [...new Set([...listed, ...previous.map((i) => i.handle)])];
		const byHandle = new Map(previous.map((i) => [i.handle, i]));
		const oldSkipped = previousHost?.skipped ?? {};
		const skipped: Record<string, string> = {};
		const items: CatalogItem[] = [];
		const gone: Gone[] = [];
		// Handles whose page was read as a piece this run.
		const read = new Set<string>();
		// Every row is reread on every successful crawl, so a row last read before the previous one
		// failed then too. One failure keeps the row; a second in a row drops it.
		const lastCrawl = previousHost?.lastSuccess;
		const failedLastCrawl = (row: CatalogItem) =>
			lastCrawl !== undefined && Date.parse(row.checkedAt) < Date.parse(lastCrawl);
		const drop = (row: CatalogItem, reason: string) => gone.push({ id: row.id, handle: row.handle, reason });
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
				if (page.status === 404 || page.status === 410) {
					if (old) drop(old, `answered ${page.status}`);
					continue;
				}
				if (page.status !== 200) throw new ParseError(`answered ${page.status}`);
				// A renamed product redirects to its new handle; index it there, once.
				finalHandle = decodeURIComponent(new URL(page.url).pathname.replace(/^\/products\//, ''));
				if (finalHandle !== handle && read.has(finalHandle)) {
					if (old) drop(old, `redirects to ${finalHandle}`);
					continue;
				}
				item = toItem(museum.id, origin, finalHandle, parseProductPage(page.body, finalHandle), old, options.now);
			} catch (error) {
				// Throttling ends the shop's crawl; anything wrong with one page only affects that page.
				if (error instanceof HostBlockedError) throw error;
				const message = error instanceof Error ? error.message : String(error);
				if (old && failedLastCrawl(old)) drop(old, `${message}; last read ${old.checkedAt.slice(0, 10)}`);
				else {
					console.error(`  ${old ? 'kept previous' : 'could not read'} ${museum.id}/${handle}: ${message}`);
					if (old) items.push(old);
				}
				if (oldSkipped[handle]) skipped[handle] = oldSkipped[handle];
				continue;
			}
			if (old && item && item.id !== old.id) drop(old, `now reads as ${item.id} at ${finalHandle}`);
			if (item && removed.has(item.id)) continue;
			if (item) {
				items.push(item);
				read.add(finalHandle);
			} else {
				skipped[finalHandle] = options.now;
				if (old) drop(old, 'no longer reads as clothing');
			}
		}

		if (previous.length > 0 && items.length < previous.length * MIN_COUNT_RATIO) {
			for (const g of gone) console.error(`  would drop ${museum.id}/${g.handle}: ${g.reason}`);
			return {
				items: previous,
				host: host('count-drop', previous.length, { error: `found ${items.length}, had ${previous.length}` }),
				gone: [],
			};
		}
		const unique = [...new Map(items.map((i) => [i.id, i])).values()].sort((a, b) => a.id.localeCompare(b.id));
		// A piece seen gone at one handle but read at another stays.
		const kept = new Set(unique.map((i) => i.id));
		const left = gone.filter((g) => !kept.has(g.id));
		for (const g of left) console.error(`  dropped ${museum.id}/${g.handle}: ${g.reason}`);
		// A limited run leaves rows unread, so it doesn't count as a crawl.
		const lastSuccess = options.limit === undefined ? options.now : (previousHost?.lastSuccess ?? options.now);
		return { items: unique, host: host('ok', unique.length, { lastSuccess, skipped }), gone: left };
	} catch (error) {
		// Any failure keeps last week's items for this shop; the reason lands in hosts.json.
		const message = error instanceof Error ? error.message : String(error);
		console.error(`  ${museum.id} failed${error instanceof HostBlockedError ? ' (blocked)' : ''}: ${message}`);
		return { items: previous, host: host('error', previous.length, { error: message }), gone: [] };
	}
}
