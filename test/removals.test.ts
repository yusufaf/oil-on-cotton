import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { crawlMuseum } from '../ingest/catalog';
import type { CatalogItem } from '../src/lib/catalog';
import type { Museum } from '../src/lib/museums';
import { parseRemovals, removedIds, removedMuseums, visible } from '../src/lib/removals';
import { fakeCrawler } from './helpers';

const piece = (museum: string, id: number, handle = `piece-${id}`) =>
	({ id: `${museum}:${id}`, museum, handle }) as CatalogItem;

describe('data/removals.yaml', () => {
	it('parses', () => {
		expect(() => parseRemovals(readFileSync('data/removals.yaml', 'utf8'))).not.toThrow();
	});

	it('takes a piece or a whole shop, and nothing else', () => {
		const removals = parseRemovals(
			'- { id: "getty:1", removedAt: "2026-11-01", reason: shop request }\n' +
				'- { museum: lacma, removedAt: "2026-11-01", reason: shop request }\n',
		);
		expect(removedIds(removals)).toEqual(new Set(['getty:1']));
		expect(removedMuseums(removals)).toEqual(new Set(['lacma']));
		expect(() => parseRemovals('- { id: "getty:1", removedAt: "2026-11-01" }')).toThrow();
		expect(() => parseRemovals('- { id: "getty:1", museum: getty, removedAt: "2026-11-01", reason: x }')).toThrow();
		expect(() => parseRemovals('- { id: "getty:1", removedAt: "2026-11-01", reason: x, email: a@b.c }')).toThrow();
	});

	it('reads an empty file as no removals', () => {
		expect(parseRemovals('')).toEqual([]);
		expect(parseRemovals('[]\n')).toEqual([]);
	});
});

describe('visible', () => {
	it('drops removed pieces and every piece from a removed shop', () => {
		const items = [piece('getty', 1), piece('getty', 2), piece('lacma', 3)];
		const removals = parseRemovals(
			'- { id: "getty:1", removedAt: "2026-11-01", reason: x }\n- { museum: lacma, removedAt: "2026-11-01", reason: x }\n',
		);
		expect(visible(items, removals).map((i) => i.id)).toEqual(['getty:2']);
	});
});

describe('crawlMuseum with removals', () => {
	const museum = { id: 'whitney', storeUrl: 'https://shop.example', apparelCollections: ['apparel'] } as Museum;
	const productHtml = readFileSync('test/fixtures/product-ld-offers.html', 'utf8');
	const NOW = '2026-11-01T12:00:00.000Z';

	it('never fetches a removed piece it knows, and drops one it finds under a new handle', async () => {
		const old = { ...piece('whitney', 7, 'old-tee'), name: 'Old T-shirt' } as CatalogItem;
		const { crawler, seen } = await fakeCrawler({
			'/robots.txt': 'User-agent: *\nDisallow: /cart',
			'/collections/apparel': '<a href="/products/old-tee">a</a><a href="/products/whitney-ny-t-shirt">b</a>',
			'/products/whitney-ny-t-shirt': productHtml,
		});
		const result = await crawlMuseum(crawler, museum, [old], undefined, {
			now: NOW,
			removed: new Set(['whitney:7', 'whitney:8938971988258']),
		});
		const fetched = seen.map((r) => new URL(r.url).pathname).filter((p) => p.startsWith('/products/'));
		expect(fetched).toEqual(['/products/whitney-ny-t-shirt']);
		expect(result.items).toEqual([]);
		expect(result.host.skipped).toEqual({});
	});
});
