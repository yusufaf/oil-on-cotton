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
		['Medieval Alphabet Tie', 'tie'],
		['Tie-Dye T-shirt', 'tee'],
		['Colorblock Knit Gloves', 'gloves'],
		['Keith Haring Radiant Baby Onesie', 'onesie'],
		['Getty Pride Tank top', 'top'],
		['Black Crop Top', 'top'],
		['Linen Tank Dress', 'dress'],
		['Knit Hoodie', 'hoodie'],
		['Fish Tank T-shirt', 'tee'],
		['Silk Camisole', 'top'],
		['Witte Marvelje Knitted Embroidery Crewneck - Cream', 'sweater'],
		['Merino Knit Pullover', 'sweater'],
		['Basquiat "Pez Dispenser" Crewneck', 'sweatshirt'],
		['Simple Rib Knit Beanie - Kelly/Stone Blue', 'hat'],
	])('%s is a %s', (name, garment) => {
		expect(garmentOf(name)).toBe(garment);
	});

	it.each([
		'Navy Miffy Keychain',
		'King Arthur Crown with Hood',
		'T-shirt Tote Bag',
		'Hat Pin',
		'Shark Tank Sticker Sheet',
		'Calder Chess Set',
		'Mug',
		'Van Gogh Irises Linen Apron',
		'Tie Clip',
		'Silk Tie Bar',
		'Hair Ties',
		'Tie-Dye Kit',
		'Rainbow Tie Dye',
		'Oven Glove',
		'Gardening Gloves',
		'Bodysuit',
	])(
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

	it.each(['BLACK', 'Default Title', 'Blue/White', '10'])('%s is not a size', (value) => {
		expect(normalizeSize(value)).toBeUndefined();
	});

	it('reads combined sizes, and bare numbers only on children’s clothing', () => {
		expect(normalizeSize('S/M')).toBe('S/M');
		expect(normalizeSize('l/xl')).toBe('L/XL');
		expect(normalizeSize('S / M')).toBe('S/M');
		expect(normalizeSize('10', true)).toBe('Kids 10');
		expect(normalizeSize('Youth 10')).toBe('Kids 10');
		expect(normalizeSize('Kids 8')).toBe('Kids 8');
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

	it('orders kids sizes numerically', () => {
		expect(sizesOf([v(['10', 'CAT'], true), v(['2', 'CAT'], false), v(['4', 'ZEBRA'], true)], true).map((s) => s.label)).toEqual([
			'Kids 2',
			'Kids 4',
			'Kids 10',
		]);
	});

	it('puts baby and toddler sizes before kids sizes, and combined sizes after their first part', () => {
		expect(sizesOf([v(['10'], true), v(['2T'], true), v(['6-12 Months'], true)], true).map((s) => s.label)).toEqual([
			'6-12 months',
			'2T',
			'Kids 10',
		]);
		expect(sizesOf([v(['M/L']), v(['M']), v(['S/M']), v(['S'])]).map((s) => s.label)).toEqual(['S', 'S/M', 'M', 'M/L']);
	});

	it('reports a single unsized variant as one size', () => {
		expect(sizesOf([v(['Default Title'], true)])).toEqual([{ label: 'One size', available: true }]);
		expect(sizesOf([v(['Red'], false), v(['Blue'], true)])).toEqual([{ label: 'One size', available: true }]);
	});

	it('treats unknown availability as not in stock', () => {
		expect(sizesOf([v(['M'])])).toEqual([{ label: 'M', available: false }]);
	});
});
