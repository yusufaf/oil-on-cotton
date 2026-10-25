import { describe, expect, it } from 'vitest';
import { garmentOf } from '../ingest/classify';
import { normalizeSize, sizesOf } from '../ingest/sizes';

describe('garmentOf', () => {
	it.each([
		['Whitney NY T-shirt', 'tee'],
		['Basquiat "New York/New Wave" Hoodie', 'hoodie'],
		['Hooded Sweatshirt', 'hoodie'],
		['Getty Crew Neck Sweatshirt', 'sweatshirt'],
		['Cathedral #2 Quarter-Zip Sherpa Pullover', 'sweatshirt'],
		['Laughing Cat Sweater', 'sweater'],
		['Chantilly Kakiemon Collection Scarf', 'scarf'],
		['Whitney Museum of American Art Hat', 'hat'],
		['Keith Haring Dog T-shirt', 'tee'],
		['Pin Stripe Hat', 'hat'],
		['Oxford Button-Down Shirt', 'shirt'],
	])('%s is a %s', (name, garment) => {
		expect(garmentOf(name)).toBe(garment);
	});

	it.each(['Navy Miffy Keychain', 'King Arthur Crown with Hood', 'T-shirt Tote Bag', 'Hat Pin', 'Calder Chess Set', 'Mug'])(
		'%s is not clothing',
		(name) => {
			expect(garmentOf(name)).toBeUndefined();
		},
	);
});

describe('normalizeSize', () => {
	it.each([
		['SMALL', 'S'],
		['x-large', 'XL'],
		['XXL', '2XL'],
		['Adult M', 'M'],
		['Size L', 'L'],
		["Women's S", "Women's S"],
		['youth l', 'Youth L'],
		['One Size', 'One size'],
		['2T', '2T'],
		['6-12 Months', '6-12 months'],
	])('%s -> %s', (value, label) => {
		expect(normalizeSize(value)).toBe(label);
	});

	it.each(['BLACK', 'Default Title', 'Blue/White'])('%s is not a size', (value) => {
		expect(normalizeSize(value)).toBeUndefined();
	});
});

describe('sizesOf', () => {
	const v = (options: string[], available?: boolean) => ({ id: 1, options, price: 100, available });

	it('merges colours into one size, available if any colour is, in size order', () => {
		expect(sizesOf([v(['XXL', 'Black'], true), v(['SMALL', 'Black'], false), v(['SMALL', 'White'], true), v(['M', 'Black'], false)])).toEqual([
			{ label: 'S', available: true },
			{ label: 'M', available: false },
			{ label: '2XL', available: true },
		]);
	});

	it('reports a single unsized variant as one size', () => {
		expect(sizesOf([v(['Default Title'], true)])).toEqual([{ label: 'One size', available: true }]);
		expect(sizesOf([v(['Red'], false), v(['Blue'], true)])).toEqual([{ label: 'One size', available: true }]);
	});

	it('treats unknown availability as not in stock', () => {
		expect(sizesOf([v(['M'])])).toEqual([{ label: 'M', available: false }]);
	});
});
