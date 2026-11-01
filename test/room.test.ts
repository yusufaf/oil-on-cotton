import { describe, expect, it } from 'vitest';
import type { Artist } from '../src/lib/artists';
import type { CatalogItem } from '../src/lib/catalog';
import { isChildSize } from '../src/lib/kids';
import type { Museum } from '../src/lib/museums';
import {
	fillLede,
	groupCounts,
	isKids,
	kindLabel,
	priceText,
	roomFacts,
	roomMuseums,
	sizesLine,
	sortKeys,
} from '../src/lib/room';

const CHECKED = '2026-10-26T16:00:00.000Z';
const NOW = new Date('2026-10-31T12:00:00.000Z');

let next = 1;
const piece = (extra: Partial<CatalogItem> = {}): CatalogItem => ({
	id: `whitney:${next++}`,
	museum: 'whitney',
	handle: 'h',
	url: 'https://shop.example/products/h',
	name: 'Plain T-shirt',
	garment: 'tee',
	price: { min: 3500, max: 3500 },
	sizes: [{ label: 'M', available: true }],
	available: true,
	firstSeen: CHECKED,
	checkedAt: CHECKED,
	...extra,
});

const sizes = (...labels: string[]) => labels.map((label) => ({ label, available: true }));

describe('isKids, on every catalog name that mentions children (2026-10-26)', () => {
	it.each([
		['Getty Villa Museum Pegasus Youth T-Shirt', sizes('XS', 'S', 'M', 'L'), true],
		['Apple Juice 3D Kids Socks', sizes('One size'), true],
		['Kids Socks That Protect Bees', sizes('One size'), true],
		['Socks That Support Youth Sports', sizes('S', 'M'), false],
		['Kids Socks That Support Youth Sports', sizes('One size'), true],
		['Kids Socks That Protect Owls', sizes('One size'), true],
		['Youth ALL FOR ART Adjustable Baseball Cap - Travertine', sizes('One size'), true],
		['Start Small and Dream Big Youth T-shirt', sizes('S', 'M', 'L', 'XL'), true],
		['Basquiat "Pez Dispenser" Blue Kids T-shirt', sizes('Kids 2', 'Kids 16'), true],
		['Basquiat "Pez Dispenser" White Kids T-shirt', sizes('Kids 2', 'Kids 16'), true],
		['Keith Haring Radiant Baby Onesie', sizes('One size'), true],
		['Keith Haring Radiant Baby Kids T-shirt', sizes('Kids 2', 'Kids 12'), true],
		['Roy Lichtenstein Kids T-shirt', sizes('2T', '4T'), true],
		['Sweet Dreams, Baby! Baseball Hat', sizes('One size'), false],
		['Emerging Artist Baby Hat', sizes('0M', '3M', '6M'), true],
		['Whitney Ailey Dancer Kids T-shirt', sizes('S', 'M', 'L', 'XL'), true],
		['Calder Kid’s T-shirt', sizes('Kids 2', 'Kids 12'), true],
		['Baby Blue Beanie', sizes('One size'), false],
	])('%s: %s', (name, s, kids) => {
		expect(isKids({ name, sizes: s })).toBe(kids);
	});

	it('reads every child size label ingest writes, and no adult one', () => {
		for (const label of ['Kids 8', 'Youth S', 'Toddler M', '2T', '6M', '6-12 months', '4Y']) {
			expect(isChildSize(label), label).toBe(true);
		}
		for (const label of ['M', '2XL', 'S/M', "Women's M", 'One size']) {
			expect(isChildSize(label), label).toBe(false);
		}
	});
});

describe('kindLabel and groups', () => {
	it('marks kids pieces, except onesies', () => {
		expect(kindLabel(piece({ name: 'Calder Kid’s T-shirt' }))).toBe('T-shirt (kids)');
		expect(kindLabel(piece({ name: 'Radiant Baby Onesie', garment: 'onesie' }))).toBe('Onesie');
		expect(kindLabel(piece({ garment: 'sweater', name: 'Laughing Cat Sweater' }))).toBe('Sweater');
	});

	it('groups kinds as the spike does and leaves out empty groups', () => {
		const groups = groupCounts([{ garment: 'tee' }, { garment: 'sweater' }, { garment: 'sweatshirt' }, { garment: 'tie' }]);
		expect(groups.map((g) => [g.label, g.count])).toEqual([
			['T-shirts', 1],
			['Sweatshirts', 2],
			['Scarves and ties', 1],
		]);
	});
});

describe('priceText and sizesLine', () => {
	it('shows whole dollars, cents when needed, ranges, and sold out', () => {
		expect(priceText(piece(), NOW).text).toBe('$35');
		expect(priceText(piece({ price: { min: 4875, max: 4875 } }), NOW).text).toBe('$48.75');
		expect(priceText(piece({ price: { min: 3500, max: 5500, compareAt: 6000 } }), NOW)).toEqual({ text: '$35–$55' });
		expect(priceText(piece({ available: false }), NOW)).toEqual({ text: 'Sold out' });
	});

	it('shows a sale for 14 days after the last check, then the price alone', () => {
		const sale = piece({ price: { min: 4875, max: 4875, compareAt: 6500 } });
		expect(priceText(sale, NOW)).toEqual({ text: '$48.75', was: '$65', saleAsOf: '26 October' });
		expect(priceText(sale, new Date('2026-11-09T16:00:00.000Z')).was).toBe('$65');
		expect(priceText(sale, new Date('2026-11-09T16:00:01.000Z'))).toEqual({ text: '$48.75' });
	});

	it('lists sizes in stock, then those sold out, and nothing for one-size or sold-out pieces', () => {
		const mixed = piece({
			sizes: [
				{ label: 'S', available: true },
				{ label: 'M', available: true },
				{ label: '2XL', available: false },
			],
		});
		expect(sizesLine(mixed, priceText(mixed, NOW))).toBe('S, M · 2XL sold out');
		const oneSize = piece({ sizes: [{ label: 'One size', available: true }] });
		expect(sizesLine(oneSize, priceText(oneSize, NOW))).toBeUndefined();
		const gone = piece({ sizes: [{ label: 'S', available: false }], available: false });
		expect(sizesLine(gone, priceText(gone, NOW))).toBeUndefined();
		const stale = piece({ sizes: [{ label: 'S', available: false }], available: true });
		expect(sizesLine(stale, priceText(stale, NOW))).toBeUndefined();
	});

	it('opens the sizes line with the sale date', () => {
		const sale = piece({ price: { min: 4875, max: 4875, compareAt: 6500 } });
		expect(sizesLine(sale, priceText(sale, NOW))).toBe('On sale as of 26 October · M');
		const oneSize = { ...sale, sizes: [{ label: 'One size', available: true }] };
		expect(sizesLine(oneSize, priceText(oneSize, NOW))).toBe('On sale as of 26 October');
	});
});

describe('sortKeys', () => {
	it('breaks ties by id and ignores quotes when sorting by name', () => {
		const a = piece({ id: 'whitney:2', name: 'Robert Indiana “LOVE” T-Shirt', price: { min: 7200, max: 7200 } });
		const b = piece({ id: 'whitney:1', name: 'Robert Indiana "Love" Patch Dad Cap', price: { min: 7200, max: 7200 } });
		const c = piece({ id: 'whitney:3', name: 'Basquiat Crown Hat', price: { min: 5500, max: 9000 } });
		const keys = sortKeys([a, b, c]);
		expect([c, b, a].map((p) => keys.get(p.id)!.asc)).toEqual([0, 1, 2]);
		expect([c, b, a].map((p) => keys.get(p.id)!.desc)).toEqual([0, 1, 2]);
		expect([c, b, a].map((p) => keys.get(p.id)!.name)).toEqual([0, 1, 2]);
	});
});

describe('rooms and ledes', () => {
	const museum = (id: string, automation: Museum['automation']) => ({ id, automation }) as Museum;
	const basquiat: Artist = { id: 'jean-michel-basquiat', name: 'Jean-Michel Basquiat', wikidata: 'Q1', aliases: ['Basquiat'], works: [] };
	const calder: Artist = { id: 'alexander-calder', name: 'Alexander Calder', wikidata: 'Q2', aliases: ['Calder'], works: [] };

	it('gives a page only to automated shops with at least 8 pieces', () => {
		const items = [...Array(8)].map(() => piece());
		const museums = [museum('whitney', 'auto'), museum('met', 'manual'), museum('lacma', 'auto')];
		expect(roomMuseums(museums, items).map((m) => m.id)).toEqual(['whitney']);
		expect(roomMuseums(museums, items.slice(1))).toEqual([]);
	});

	const items = [
		piece({ name: 'Basquiat Crown Hat', price: { min: 5500, max: 5500 } }),
		piece({ name: 'Basquiat Pez Tee', price: { min: 7800, max: 7800 } }),
		piece({ name: 'Gone Scarf', price: { min: 50000, max: 50000 }, available: false, checkedAt: '2026-10-25T09:00:00.000Z' }),
	];
	const facts = roomFacts(items, [basquiat, calder]);

	it('counts pieces, prices of every listed piece, artists, and the oldest check', () => {
		expect(facts).toMatchObject({ count: 3, min: 5500, max: 50000, oldestCheck: '2026-10-25T09:00:00.000Z' });
		expect(facts.artists.get('jean-michel-basquiat')).toBe(2);
	});

	it('fills slots and refuses any it cannot back with a fact', () => {
		expect(fillLede('whitney', '{count} pieces, {min} to {max}. Basquiat on {artist:jean-michel-basquiat}.', facts)).toBe(
			'3 pieces, $55 to $500. Basquiat on 2.',
		);
		expect(() => fillLede('whitney', '{cheapest}', facts)).toThrow('Lede for whitney: {cheapest} is not a known slot');
		expect(() => fillLede('whitney', '{artist:nobody}', facts)).toThrow('names no artist');
		expect(() => fillLede('whitney', '{artist:alexander-calder}', facts)).toThrow('is 0 in this room');
	});
});
