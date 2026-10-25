import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogItemSchema, type CatalogItem, type HostState } from '../src/lib/catalog';
import type { Museum } from '../src/lib/museums';
import { crawlMuseum } from '../ingest/catalog';
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
		const { items, host } = await crawlMuseum(crawler, museum, previous, undefined, { now: NOW });
		expect(host.status).toBe('ok');
		expect(items.map((i) => i.handle)).toEqual(['tee-1', 'tee-2', 'tee-3', 'tee-4']);
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
		const { items } = await crawlMuseum(crawler, museum, previous, undefined, { now: NOW });
		expect(items.map((i) => [i.id, i.handle])).toEqual([['whitney:8938971988258', 'whitney-ny-t-shirt']]);
	});

	it('keeps last week when the crawl finds far fewer pieces', async () => {
		const previous = [1, 2, 3, 4, 5].map((n) => item(`tee-${n}`, n));
		const { crawler } = await fakeCrawler(site(['tee-1'], { '/products/tee-1': product(1) }));
		const { items, host } = await crawlMuseum(crawler, museum, previous, undefined, { now: NOW });
		expect(host).toMatchObject({ status: 'count-drop', error: 'found 1, had 5' });
		expect(items).toBe(previous);
	});

	it('keeps last week when the shop throttles', async () => {
		const previous = [item('tee-1', 1)];
		const { crawler } = await fakeCrawler(
			site([], { '/collections/apparel': () => new Response(null, { status: 429, headers: { 'retry-after': '600' } }) }),
		);
		const { items, host } = await crawlMuseum(crawler, museum, previous, undefined, { now: NOW });
		expect(host.status).toBe('error');
		expect(items).toBe(previous);
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
