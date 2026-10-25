import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ParseError, parseCollectionPage, parseProductPage } from '../ingest/shopify';

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

describe('malformed links', () => {
	it('skips links it cannot parse or decode instead of throwing', () => {
		const html = '<a href="http://[bad">x</a><a href="/products/%E0%A4%A">y</a><a href="/products/ok">z</a>';
		expect(parseCollectionPage(html, 'https://s.org/collections/c').handles).toEqual(['ok']);
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
