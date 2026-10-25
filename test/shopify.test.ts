import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	ParseError,
	parseCollectionPage,
	parseProductPage,
	parseProductSitemap,
	parseSitemapIndex,
} from '../ingest/shopify';

const fixture = (name: string) => readFileSync(`test/fixtures/${name}.html`, 'utf8');

describe('parseProductPage', () => {
	it('takes availability per variant from JSON-LD offers when the theme has no variant JSON', () => {
		const page = parseProductPage(fixture('product-ld-offers'), 'whitney-ny-t-shirt');
		expect(page).toMatchObject({ id: 8938971988258, name: 'Whitney NY T-shirt', productType: 'Apparel' });
		expect(page.tags).toBeUndefined();
		expect(page.variants.map((v) => [v.options, v.available])).toEqual([
			[['SMALL', 'BLACK'], false],
			[['SMALL', 'WHITE'], true],
			[['MEDIUM', 'BLACK'], false],
			[['XXL', 'BLACK'], true],
		]);
	});

	it('prefers the theme product JSON, with tags and sale prices, when JSON-LD has a single offer', () => {
		const page = parseProductPage(fixture('product-section-json'), 'getty-crew-neck-sweatshirt');
		expect(page.name).toBe('Getty Museum Crew Neck Sweatshirt & More');
		expect(page.tags).toEqual(['Apparel & Accessories', 'sweat shirt']);
		expect(page.variants).toEqual([
			{ id: 11, options: ['L'], price: 6500, compareAt: undefined, available: false },
			{ id: 12, options: ['M'], price: 6500, compareAt: undefined, available: false },
			{ id: 13, options: ['S'], price: 6500, compareAt: 8000, available: true },
			{ id: 14, options: ['XL'], price: 7000, compareAt: undefined, available: true },
		]);
	});

	it('reads a bare variant array, falls back to the JSON-LD name, and ignores compare-at equal to price', () => {
		const page = parseProductPage(fixture('product-variant-array'), 'alexander-calder-lacma-t-shirt');
		expect(page.name).toBe('Alexander Calder LACMA T-shirt');
		expect(page.variants.map((v) => [v.options[0], v.available, v.compareAt])).toEqual([
			['XS', false, undefined],
			['Small', true, undefined],
			['Large', true, undefined],
		]);
	});

	it('never returns descriptions or images', () => {
		const page = parseProductPage(fixture('product-section-json'), 'getty-crew-neck-sweatshirt');
		expect(JSON.stringify(page)).not.toMatch(/description|image/);
	});

	it('fails loudly without the Shopify analytics block', () => {
		expect(() => parseProductPage('<html><meta property="og:title" content="x"></html>', 'x')).toThrow(ParseError);
	});
});

describe('parseCollectionPage', () => {
	const html = `
		<link rel="canonical" href="https://shop.example.org/collections/apparel">
		<link href="/collections/apparel?page=2" rel="next">
		<a href="/collections/apparel/products/tee-one">Tee</a>
		<a class="x" href='/products/tee-one?variant=1'>dup</a>
		<a href="/products/caf%C3%A9-scarf">Scarf</a>
		<a href="/collections/other">not a product</a>
		<a href="/products/tee-two/reviews">not a product page</a>`;

	it('collects unique handles and the next page', () => {
		const page = parseCollectionPage(html, 'https://shop.example.org/collections/apparel');
		expect(page.handles).toEqual(['tee-one', 'café-scarf']);
		expect(page.next).toBe('https://shop.example.org/collections/apparel?page=2');
	});

	it('has no next on the last page', () => {
		expect(parseCollectionPage('<a href="/products/a">a</a>', 'https://s.org/collections/c').next).toBeUndefined();
	});
});

describe('sitemaps', () => {
	it('keeps same-origin product sitemaps only', () => {
		const xml = `<sitemapindex>
			<sitemap><loc>https://shop.example.org/sitemap_products_1.xml?from=1&amp;to=99</loc></sitemap>
			<sitemap><loc>https://shop.example.org/sitemap_pages_1.xml</loc></sitemap>
			<sitemap><loc>https://shop.example.org/en-ca/sitemap_products_1.xml</loc></sitemap>
			<sitemap><loc>https://elsewhere.example/sitemap_products_1.xml</loc></sitemap>
		</sitemapindex>`;
		expect(parseSitemapIndex(xml, 'https://shop.example.org')).toEqual([
			'https://shop.example.org/sitemap_products_1.xml?from=1&to=99',
		]);
	});

	it('maps product handles to lastmod', () => {
		const xml = `<urlset>
			<url><loc>https://shop.example.org/</loc><changefreq>daily</changefreq></url>
			<url><loc>https://shop.example.org/products/tee-one</loc><lastmod>2026-10-20T10:00:00-04:00</lastmod></url>
		</urlset>`;
		expect([...parseProductSitemap(xml)]).toEqual([['tee-one', '2026-10-20T14:00:00.000Z']]);
	});

	it('skips entries with a bad lastmod or loc instead of throwing', () => {
		const xml = `<urlset>
			<url><loc>https://s.org/products/a</loc><lastmod>unknown</lastmod></url>
			<url><loc>https://s.org/products/%E0%A4%A</loc><lastmod>2026-10-20</lastmod></url>
			<url><loc>/products/relative</loc><lastmod>2026-10-20</lastmod></url>
			<url><loc>https://s.org/products/b</loc><lastmod>2026-10-20</lastmod></url>
		</urlset>`;
		expect([...parseProductSitemap(xml).keys()]).toEqual(['relative', 'b']);
	});
});

describe('names', () => {
	it('decodes og:title entities exactly once', () => {
		const html = fixture('product-ld-offers').replace(
			'content="Whitney NY T-shirt"',
			'content="Tom &amp;amp; Jerry T-shirt &#99999999;"',
		);
		expect(parseProductPage(html, 'whitney-ny-t-shirt').name).toBe('Tom &amp; Jerry T-shirt &#99999999;');
	});
});
