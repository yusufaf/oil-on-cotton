import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogItemSchema, hostsSchema, type CatalogItem, type HostState } from '../src/lib/catalog';
import type { Work } from '../src/lib/curation';
import type { Museum } from '../src/lib/museums';
import { crawlMuseum, goneReport, hostsFile, leftSince, type Gone } from '../ingest/catalog';
import { fakeCrawler } from './helpers';

const museum = {
	id: 'whitney',
	storeUrl: 'https://shop.example',
	apparelCollections: ['apparel'],
} as Museum;

const NOW = '2026-10-25T12:00:00.000Z';
const NEXT_WEEK = '2026-11-01T12:00:00.000Z';
const FIVE_WEEKS_ON = '2026-11-29T12:00:00.000Z';
const productHtml = readFileSync('test/fixtures/product-ld-offers.html', 'utf8');

// The fixture page, as a different product.
const product = (id: number, name = `Tee ${id} T-shirt`) =>
	productHtml.replaceAll('8938971988258', String(id)).replace('content="Whitney NY T-shirt"', `content="${name}"`);

const item = (handle: string, id: number): CatalogItem => ({
	id: `whitney:${id}`,
	museum: 'whitney',
	handle,
	url: `https://shop.example/products/${handle}`,
	name: `${handle} T-shirt`,
	garment: 'tee',
	price: { min: 3500, max: 3500 },
	sizes: [{ label: 'M', available: true }],
	available: true,
	firstSeen: '2026-10-01T00:00:00.000Z',
	checkedAt: '2026-10-18T12:00:00.000Z',
});

const hostWith = (skipped: Record<string, string>): HostState => ({
	lastAttempt: NOW,
	status: 'ok',
	requests: 0,
	items: 0,
	skipped,
});

function site(handles: string[], extra: Record<string, string | number | ((r: Request) => Response)> = {}) {
	return {
		'/robots.txt': 'User-agent: *\nDisallow: /cart',
		'/collections/apparel': handles.map((h) => `<a href="/products/${h}">${h}</a>`).join(''),
		...extra,
	};
}

const productPaths = (requests: { url: string }[]) =>
	requests.map((r) => new URL(r.url).pathname).filter((p) => p.startsWith('/products/'));

const LAST_WEEK = '2026-10-18T12:00:00.000Z';
// What the delisted pages answered: ShopifyAnalytics meta with no product in it.
const noProduct = (html: string) =>
	html.replace(/var meta = \{"product":\{.*?\}\};/s, 'var meta = {"page":{"pageType":"product"}};');
const crawledAt = (at: string): HostState => ({ ...hostWith({}), lastAttempt: at, lastSuccess: at });
// checkedAt is LAST_WEEK. Five rows, so dropping one leaves 4/5, which is not a count drop.
const five = () => [1, 2, 3, 4, 5].map((n) => item(`tee-${n}`, n));
const healthy = Object.fromEntries([1, 2, 3, 4].map((n) => [`/products/tee-${n}`, product(n)]));
const shop = (tee5: string | number | ((r: Request) => Response)) =>
	site(['tee-1', 'tee-2', 'tee-3', 'tee-4', 'tee-5'], { ...healthy, '/products/tee-5': tee5 });
const redirect = (to: string) => () => new Response(null, { status: 301, headers: { location: `/products/${to}` } });

describe('crawlMuseum', () => {
	it('reads new products, keeps facts only, and remembers non-clothing', async () => {
		const { crawler } = await fakeCrawler(
			site(['whitney-ny-t-shirt', 'mug'], {
				'/products/whitney-ny-t-shirt': productHtml,
				'/products/mug': product(2, 'Whitney Mug'),
			}),
		);
		const result = await crawlMuseum(crawler, museum, [], undefined, { now: NOW });
		expect(result.host).toMatchObject({ status: 'ok', items: 1, skipped: { mug: NOW } });
		expect(result.items).toEqual([
			{
				id: 'whitney:8938971988258',
				museum: 'whitney',
				handle: 'whitney-ny-t-shirt',
				url: 'https://shop.example/products/whitney-ny-t-shirt',
				name: 'Whitney NY T-shirt',
				garment: 'tee',
				price: { min: 3500, max: 3500 },
				sizes: [
					{ label: 'S', available: true },
					{ label: 'M', available: false },
					{ label: '2XL', available: true },
				],
				available: true,
				productType: 'Apparel',
				firstSeen: NOW,
				checkedAt: NOW,
			},
		]);
	});

	it('rereads catalog pieces every run, keeping firstSeen, but not recently skipped pages', async () => {
		const { crawler } = await fakeCrawler(
			site(['whitney-ny-t-shirt', 'mug'], { '/products/whitney-ny-t-shirt': productHtml }),
		);
		const previous = [{ ...item('whitney-ny-t-shirt', 8938971988258), firstSeen: NOW }];
		const { items, host } = await crawlMuseum(crawler, museum, previous, hostWith({ mug: NOW }), { now: NEXT_WEEK });
		expect(productPaths(crawler.requests)).toEqual(['/products/whitney-ny-t-shirt']);
		expect(items[0]).toMatchObject({ firstSeen: NOW, checkedAt: NEXT_WEEK });
		expect(items[0].sizes).toHaveLength(3);
		expect(host.skipped).toEqual({ mug: NOW });
	});

	it('rechecks a skipped page after four weeks, or at once on refresh', async () => {
		const routes = site(['mug'], { '/products/mug': product(2, 'Whitney Mug') });
		const later = await fakeCrawler(routes);
		const result = await crawlMuseum(later.crawler, museum, [], hostWith({ mug: NOW }), { now: FIVE_WEEKS_ON });
		expect(productPaths(later.crawler.requests)).toEqual(['/products/mug']);
		expect(result.host.skipped).toEqual({ mug: FIVE_WEEKS_ON });

		const refreshed = await fakeCrawler(routes);
		await crawlMuseum(refreshed.crawler, museum, [], hostWith({ mug: NOW }), { now: NEXT_WEEK, refresh: true });
		expect(productPaths(refreshed.crawler.requests)).toEqual(['/products/mug']);
	});

	it('keeps a skipped page on the monthly cycle when its recheck fails', async () => {
		const { crawler } = await fakeCrawler(site(['mug'], { '/products/mug': 500 }));
		const result = await crawlMuseum(crawler, museum, [], hostWith({ mug: NOW }), { now: FIVE_WEEKS_ON });
		expect(result.host.skipped).toEqual({ mug: NOW });
	});

	it('keeps the skip list for pages a limited run did not reach', async () => {
		const { crawler } = await fakeCrawler(site(['a-mug', 'b-mug'], { '/products/a-mug': 404 }));
		const result = await crawlMuseum(crawler, museum, [], hostWith({ 'a-mug': NOW, 'b-mug': NOW }), {
			now: NOW,
			refresh: true,
			limit: 1,
		});
		expect(result.host.skipped).toEqual({ 'b-mug': NOW });
	});

	it('drops a piece only once its own product page is gone', async () => {
		const previous = [1, 2, 3, 4, 5].map((n) => item(`tee-${n}`, n));
		const pages = Object.fromEntries([1, 2, 3, 4].map((n) => [`/products/tee-${n}`, product(n)]));
		const { crawler } = await fakeCrawler(site(['tee-1', 'tee-2', 'tee-3', 'tee-4'], { ...pages, '/products/tee-5': 404 }));
		const { items, host, gone } = await crawlMuseum(crawler, museum, previous, undefined, { now: NOW });
		expect(host.status).toBe('ok');
		expect(items.map((i) => i.handle)).toEqual(['tee-1', 'tee-2', 'tee-3', 'tee-4']);
		expect(gone).toEqual([{ id: 'whitney:5', handle: 'tee-5', reason: 'answered 404' }]);
	});

	it('confines a bad product page, or one robots.txt disallows, to that piece', async () => {
		const previous = [item('tee-1', 1), item('tee-2', 2)];
		const { crawler } = await fakeCrawler({
			...site(['tee-1', 'tee-2', 'whitney-ny-t-shirt'], {
				'/products/tee-1': '<html>garbage</html>',
				'/products/whitney-ny-t-shirt': productHtml,
			}),
			'/robots.txt': 'User-agent: *\nDisallow: /products/tee-2',
		});
		const { items, host } = await crawlMuseum(crawler, museum, previous, undefined, { now: NOW });
		expect(host.status).toBe('ok');
		expect(items.map((i) => i.handle)).toEqual(['tee-1', 'tee-2', 'whitney-ny-t-shirt']);
		expect(items[0]).toBe(previous[0]);
	});

	it('follows a renamed handle to its new page without duplicating the piece', async () => {
		const previous = [item('old-tee', 8938971988258)];
		const { crawler } = await fakeCrawler(
			site(['whitney-ny-t-shirt'], {
				'/products/whitney-ny-t-shirt': productHtml,
				'/products/old-tee': () => new Response(null, { status: 301, headers: { location: '/products/whitney-ny-t-shirt' } }),
			}),
		);
		const { items, gone } = await crawlMuseum(crawler, museum, previous, undefined, { now: NOW });
		expect(items.map((i) => [i.id, i.handle])).toEqual([['whitney:8938971988258', 'whitney-ny-t-shirt']]);
		expect(gone).toEqual([]);
	});

	it('keeps last week when the crawl finds far fewer pieces', async () => {
		const previous = [1, 2, 3, 4, 5].map((n) => item(`tee-${n}`, n));
		const { crawler } = await fakeCrawler(site(['tee-1'], { '/products/tee-1': product(1) }));
		const { items, host, gone } = await crawlMuseum(crawler, museum, previous, undefined, { now: NOW });
		expect(host).toMatchObject({ status: 'count-drop', error: 'found 1, had 5' });
		expect(items).toBe(previous);
		expect(gone).toEqual([]);
	});

	it('keeps last week when the shop throttles', async () => {
		const previous = [item('tee-1', 1)];
		const { crawler } = await fakeCrawler(
			site([], { '/collections/apparel': () => new Response(null, { status: 429, headers: { 'retry-after': '600' } }) }),
		);
		const { items, host, gone } = await crawlMuseum(crawler, museum, previous, undefined, { now: NOW });
		expect(host.status).toBe('error');
		expect(items).toBe(previous);
		expect(gone).toEqual([]);
	});
});

describe('a page that keeps failing', () => {
	it('keeps a piece the first time its page has no product', async () => {
		expect(noProduct(productHtml)).not.toBe(productHtml);
		const previous = five();
		const { crawler } = await fakeCrawler(shop(noProduct(product(5))));
		const { items, host, gone } = await crawlMuseum(crawler, museum, previous, crawledAt(LAST_WEEK), { now: NOW });
		expect(host.status).toBe('ok');
		expect(items.map((i) => i.handle)).toEqual(['tee-1', 'tee-2', 'tee-3', 'tee-4', 'tee-5']);
		expect(items[4]).toBe(previous[4]);
		expect(gone).toEqual([]);
	});

	it.each([
		['has no product', noProduct(product(5)), 'meta has no product'],
		['answers 500', 500, 'answered 500'],
	])('drops a piece whose page %s on two crawls in a row', async (_, page, reason) => {
		const first = await fakeCrawler(shop(page));
		const r1 = await crawlMuseum(first.crawler, museum, five(), crawledAt(LAST_WEEK), { now: NOW });
		expect(r1.items).toHaveLength(5);
		const second = await fakeCrawler(shop(page));
		const r2 = await crawlMuseum(second.crawler, museum, r1.items, r1.host, { now: NEXT_WEEK });
		expect(r2.host.status).toBe('ok');
		expect(r2.items.map((i) => i.handle)).toEqual(['tee-1', 'tee-2', 'tee-3', 'tee-4']);
		expect(r2.gone).toEqual([{ id: 'whitney:5', handle: 'tee-5', reason: `${reason}; last read 2026-10-18` }]);
	});

	it('keeps a piece whose page recovers between failures', async () => {
		const failing = shop(noProduct(product(5)));
		const r1 = await crawlMuseum((await fakeCrawler(failing)).crawler, museum, five(), crawledAt(LAST_WEEK), {
			now: NOW,
		});
		const r2 = await crawlMuseum((await fakeCrawler(shop(product(5)))).crawler, museum, r1.items, r1.host, {
			now: NEXT_WEEK,
		});
		expect(r2.items[4]).toMatchObject({ checkedAt: NEXT_WEEK, firstSeen: '2026-10-01T00:00:00.000Z' });
		const r3 = await crawlMuseum((await fakeCrawler(failing)).crawler, museum, r2.items, r2.host, {
			now: FIVE_WEEKS_ON,
		});
		expect(r3.items[4]).toMatchObject({ handle: 'tee-5', checkedAt: NEXT_WEEK });
		expect(r3.gone).toEqual([]);
	});

	it('reports a piece whose page no longer reads as clothing', async () => {
		const { crawler } = await fakeCrawler(shop(product(5, 'Whitney Mug')));
		const { items, host, gone } = await crawlMuseum(crawler, museum, five(), undefined, { now: NOW });
		expect(items.map((i) => i.handle)).toEqual(['tee-1', 'tee-2', 'tee-3', 'tee-4']);
		expect(host.skipped).toEqual({ 'tee-5': NOW });
		expect(gone).toEqual([{ id: 'whitney:5', handle: 'tee-5', reason: 'no longer reads as clothing' }]);
	});

	it('a limited run does not move lastSuccess', async () => {
		const { crawler } = await fakeCrawler(shop(product(5)));
		const { host } = await crawlMuseum(crawler, museum, five(), crawledAt(LAST_WEEK), { now: NOW, limit: 2 });
		expect(host.lastSuccess).toBe(LAST_WEEK);
	});

	it('reports a piece whose page now redirects to another piece', async () => {
		const { crawler } = await fakeCrawler(shop(redirect('tee-4')));
		const { items, host, gone } = await crawlMuseum(crawler, museum, five(), undefined, { now: NOW });
		expect(host.status).toBe('ok');
		expect(items.map((i) => i.handle)).toEqual(['tee-1', 'tee-2', 'tee-3', 'tee-4']);
		expect(gone).toEqual([{ id: 'whitney:5', handle: 'tee-5', reason: 'redirects to tee-4' }]);
	});

	it('reports a piece whose handle now reads as another product', async () => {
		const { crawler } = await fakeCrawler(shop(product(88)));
		const { items, host, gone } = await crawlMuseum(crawler, museum, five(), undefined, { now: NOW });
		expect(host.status).toBe('ok');
		expect(items.map((i) => [i.id, i.handle])).toEqual([
			['whitney:1', 'tee-1'],
			['whitney:2', 'tee-2'],
			['whitney:3', 'tee-3'],
			['whitney:4', 'tee-4'],
			['whitney:88', 'tee-5'],
		]);
		expect(gone).toEqual([{ id: 'whitney:5', handle: 'tee-5', reason: 'now reads as whitney:88 at tee-5' }]);
	});

	it('reports a piece whose page redirects to an unlisted product', async () => {
		const { crawler } = await fakeCrawler({ ...shop(redirect('other')), '/products/other': product(77) });
		const { gone } = await crawlMuseum(crawler, museum, five(), undefined, { now: NOW });
		expect(gone).toEqual([{ id: 'whitney:5', handle: 'tee-5', reason: 'now reads as whitney:77 at other' }]);
	});

	it('keeps a renamed piece whose new page fails once in the same crawl', async () => {
		let calls = 0;
		const { crawler } = await fakeCrawler(
			site(['tee-1', 'tee-2', 'tee-3', 'tee-4', 'whitney-ny-t-shirt'], {
				...healthy,
				// The listed handle comes first, so its own fetch takes the 500 and old-tee's redirect reads it.
				'/products/whitney-ny-t-shirt': () =>
					calls++ === 0 ? new Response(null, { status: 500 }) : new Response(productHtml),
				'/products/old-tee': redirect('whitney-ny-t-shirt'),
			}),
		);
		const previous = [...five().slice(0, 4), item('old-tee', 8938971988258)];
		const { items, host, gone } = await crawlMuseum(crawler, museum, previous, crawledAt(LAST_WEEK), { now: NOW });
		expect(host.status).toBe('ok');
		expect(items.map((i) => i.handle)).toEqual(['tee-1', 'tee-2', 'tee-3', 'tee-4', 'whitney-ny-t-shirt']);
		expect(items[4]).toMatchObject({
			id: 'whitney:8938971988258',
			checkedAt: NOW,
			firstSeen: '2026-10-01T00:00:00.000Z',
		});
		expect(gone).toEqual([]);
	});
});

describe('goneReport', () => {
	it('says when no rows leave', () => {
		expect(goneReport([], [])).toBe('This data PR removes no rows from the catalog.\n');
	});

	it('lists the rows that leave, and the hung pieces among them', () => {
		const gone: Gone[] = [
			{ id: 'getty:1', handle: 'a-scarf', reason: 'meta has no product; last read 2026-10-26' },
			{ id: 'getty:2', handle: 'b-hat', reason: 'answered 404' },
		];
		const works = [{ id: 'irises', pieces: [{ id: 'getty:2', label: 'Irises hat', verified: '2026-11-01' }] }] as Work[];
		expect(goneReport(gone, works)).toBe(
			[
				'Rows this data PR removes from the catalog:',
				'',
				'- getty:1 `a-scarf`: meta has no product; last read 2026-10-26',
				'- getty:2 `b-hat`: answered 404',
				'',
				'Hung pieces among them, which leave their labels:',
				'',
				'- irises: getty:2 (Irises hat)',
			].join('\n') + '\n',
		);
	});
});

describe('leftSince', () => {
	it('names every row main has that the new catalog lacks, with its reason', () => {
		const base = [item('a', 1), item('b', 2), item('c', 3), item('d', 4)];
		const gone: Gone[] = [
			{ id: 'whitney:1', handle: 'a', reason: 'answered 404' },
			{ id: 'whitney:9', handle: 'new-tee', reason: 'answered 410' },
		];
		expect(leftSince(base, [item('d', 4)], gone, new Set(['whitney:2']))).toEqual([
			{ id: 'whitney:1', handle: 'a', reason: 'answered 404' },
			{ id: 'whitney:2', handle: 'b', reason: 'taken down in data/removals.yaml' },
			{ id: 'whitney:3', handle: 'c', reason: 'left in an earlier crawl of this data PR' },
			{ id: 'whitney:9', handle: 'new-tee', reason: 'answered 410' },
		]);
	});

	it('is empty when nothing left, and names an id dropped at two handles once', () => {
		const base = [item('a', 1)];
		expect(leftSince(base, base, [], new Set())).toEqual([]);
		const g: Gone = { id: 'whitney:5', handle: 'tee-5', reason: 'answered 404' };
		expect(leftSince([], [], [g, g], new Set())).toEqual([g]);
	});
});

describe('hostsFile', () => {
	const hosts = () => ({
		whitney: hostWith({ 'zine-tote': NOW, 'apron-blue': NOW, 'mug-2': NEXT_WEEK }),
		getty: hostWith({ 'b-pin': NOW, 'a-cap': NOW }),
	});

	it('writes shops and each skip list sorted by key, as tab-indented JSON', () => {
		const input = hosts();
		const out = hostsFile(input);
		const parsed = JSON.parse(out);
		expect(Object.keys(parsed)).toEqual(['getty', 'whitney']);
		expect(Object.keys(parsed.whitney.skipped)).toEqual(['apron-blue', 'mug-2', 'zine-tote']);
		expect(Object.keys(parsed.getty.skipped)).toEqual(['a-cap', 'b-pin']);
		expect(parsed).toEqual(input);
		expect(out.endsWith('}\n')).toBe(true);
		expect(out).toContain('\n\t"getty": {');
	});

	it('gives the same file whatever order the crawl met the skipped pages in', async () => {
		const mugs = Object.fromEntries(
			['z-mug', 'a-mug', 'm-mug'].map((h, n) => [`/products/${h}`, product(n + 1, 'Whitney Mug')]),
		);
		const crawl = async (order: string[]) =>
			crawlMuseum((await fakeCrawler(site(order, mugs))).crawler, museum, [], undefined, { now: NOW });
		const first = await crawl(['z-mug', 'a-mug', 'm-mug']);
		const second = await crawl(['m-mug', 'z-mug', 'a-mug']);
		expect(Object.keys(first.host.skipped)).toEqual(['z-mug', 'a-mug', 'm-mug']);
		expect(hostsFile({ whitney: first.host })).toBe(hostsFile({ whitney: second.host }));
		const written = JSON.parse(hostsFile({ whitney: first.host }));
		expect(Object.keys(written.whitney.skipped)).toEqual(['a-mug', 'm-mug', 'z-mug']);
	});

	it('reads back through hostsSchema and does not change its input', () => {
		const input = hosts();
		const before = Object.keys(input.whitney.skipped);
		expect(hostsSchema.parse(JSON.parse(hostsFile(input)))).toEqual(input);
		expect(Object.keys(input.whitney.skipped)).toEqual(before);
	});
});

describe('children’s sizing', () => {
	const kidsTee = (name: string) =>
		productHtml.replace('content="Whitney NY T-shirt"', `content="${name}"`).replaceAll('SMALL \\/ ', '4 \\/ ');

	it.each([
		['Children’s T-shirt', true],
		['Childrens T-shirt', true],
		['Baby Blue T-shirt', false],
	])('%s gets kids sizes: %s', async (name, kids) => {
		const { crawler } = await fakeCrawler(site(['t'], { '/products/t': kidsTee(name) }));
		const { items } = await crawlMuseum(crawler, museum, [], undefined, { now: NOW });
		expect(items[0].sizes.some((s) => s.label === 'Kids 4')).toBe(kids);
	});
});

describe('catalog schema', () => {
	it('rejects descriptions and images', () => {
		expect(() => catalogItemSchema.parse({ ...item('a', 1), description: 'x' })).toThrow();
		expect(() => catalogItemSchema.parse({ ...item('a', 1), image: 'https://x/y.jpg' })).toThrow();
	});
});
