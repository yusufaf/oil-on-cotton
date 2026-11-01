import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { artistSchema, matchArtists } from '../src/lib/artists';
import type { CatalogItem } from '../src/lib/catalog';
import { CURATION, hangsFor, readCuration, type Work } from '../src/lib/curation';
import { museumSchema } from '../src/lib/museums';
import { readRemovals, removedIds, visible, type Removal } from '../src/lib/removals';

const read = (path: string) => parse(readFileSync(path, 'utf8'));
const works = readCuration();
const museums = museumSchema.array().parse(read('data/museums.yaml'));
const artists = artistSchema.array().parse(read('data/artists.yaml'));
const catalog: Pick<CatalogItem, 'id' | 'museum' | 'name' | 'tags'>[] = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const fixture: Pick<CatalogItem, 'id' | 'museum' | 'name' | 'tags'>[] = JSON.parse(
	readFileSync('test/fixtures/catalog-2026-10-26.json', 'utf8'),
);

// DESIGN.md, Voice and copy.
const BANNED =
	/\b(delve|crafting|passionate|seamless|leverage|robust|journey|elevate|empower|unlock|transform|showcase|testament|pivotal|vibrant|meticulous|multifaceted)\b/i;

describe('data/curation.yaml', () => {
	it('quotes every date, so no YAML parser turns one into a Date', () => {
		// Parse the way Astro's file() loader does, with timestamps on.
		const dates: string[] = [];
		const walk = (value: unknown, path: string): void => {
			if (value instanceof Date) dates.push(path);
			else if (value && typeof value === 'object')
				for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
		};
		walk(parse(readFileSync(CURATION, 'utf8'), { customTags: ['timestamp'] }), 'curation');
		expect(dates).toEqual([]);
	});

	it('has unique ids', () => {
		const ids = works.map((w) => w.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('hangs works in known rooms, by known artists named as artists.yaml names them', () => {
		const rooms = new Set(museums.map((m) => m.id));
		for (const work of works) {
			expect(rooms.has(work.room), `${work.id}: room ${work.room}`).toBe(true);
			const artist = artists.find((a) => a.id === work.artist);
			expect(artist, `${work.id}: artist ${work.artist}`).toBeDefined();
			expect(artist!.name, `${work.id}: name`).toBe(work.name);
		}
	});

	it('lists pieces from its own room, each under one work only', () => {
		const seen = new Set<string>();
		for (const work of works) {
			for (const piece of work.pieces) {
				expect(piece.id, work.id).toMatch(new RegExp(`^${work.room}:\\d+$`));
				expect(seen.has(piece.id), `${piece.id} hangs twice`).toBe(false);
				seen.add(piece.id);
			}
		}
	});

	it('lists only pieces that exist, so a typo is caught', () => {
		const known = new Set([...catalog, ...fixture].map((i) => i.id));
		const removed = removedIds(readRemovals());
		for (const work of works) {
			for (const piece of work.pieces) {
				expect(known.has(piece.id) || removed.has(piece.id), `${work.id}: ${piece.id}`).toBe(true);
			}
		}
	});

	it('lists pieces the matcher gives to the same artist, so label and checklist agree', () => {
		for (const work of works) {
			for (const piece of work.pieces) {
				const item = catalog.find((i) => i.id === piece.id) ?? fixture.find((i) => i.id === piece.id);
				if (!item) continue; // removed, and so never shown
				expect(matchArtists(item, artists), `${work.id}: ${item.name}`).toContain(work.artist);
			}
		}
	});

	it('has an image file for every work', () => {
		for (const work of works) expect(existsSync(`src/assets/hang/${work.image.file}`), work.image.file).toBe(true);
	});

	it('has no dates in the future', () => {
		// Curators write local dates, which can run a day ahead of UTC.
		const today = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
		for (const work of works) {
			const dates = [work.checked, work.image.retrieved, ...work.pieces.flatMap((p) => (p.verified ? [p.verified] : []))];
			for (const date of dates) expect(date <= today, `${work.id}: ${date}`).toBe(true);
		}
	});

	it('follows the copy rules', () => {
		for (const work of works) {
			const copy = [work.artistLine, work.image.alt, work.image.credit, ...work.pieces.map((p) => p.label)];
			for (const text of copy) {
				expect(text, work.id).not.toMatch(/[—!]/);
				expect(text, work.id).not.toMatch(BANNED);
			}
		}
	});

	it('keeps the alt text to what the painting shows, since the label already names it', () => {
		for (const work of works) {
			const alt = work.image.alt.toLowerCase();
			// A descriptive title ("Irises") can't be kept out of a description; a leading title can.
			expect(alt.startsWith(work.title.toLowerCase()), work.id).toBe(false);
			expect(alt, work.id).not.toContain(work.name.toLowerCase());
		}
	});
});

describe('hangsFor', () => {
	const item = (museum: string, id: number) => ({ id: `${museum}:${id}`, museum, name: `Piece ${id}` }) as CatalogItem;
	const work = (id: string, room: string, pieces: number[]) =>
		({ id, room, pieces: pieces.map((n) => ({ id: `${room}:${n}`, label: `Label ${n}` })) }) as unknown as Work;

	it('keeps the curation order of pieces', () => {
		const items = [item('getty', 1), item('getty', 2), item('getty', 3)];
		const [hang] = hangsFor('getty', [work('a', 'getty', [3, 1, 2])], items);
		expect(hang.pieces.map((p) => p.item.id)).toEqual(['getty:3', 'getty:1', 'getty:2']);
		expect(hang.pieces.map((p) => p.label)).toEqual(['Label 3', 'Label 1', 'Label 2']);
	});

	it('drops a piece that is no longer in the catalog', () => {
		const [hang] = hangsFor('getty', [work('a', 'getty', [1, 2])], [item('getty', 2)]);
		expect(hang.pieces.map((p) => p.item.id)).toEqual(['getty:2']);
	});

	it('drops a work with no pieces left', () => {
		expect(hangsFor('getty', [work('a', 'getty', [1])], [item('getty', 2)])).toEqual([]);
	});

	it("leaves out another room's works", () => {
		const items = [item('getty', 1), item('whitney', 1)];
		const hangs = hangsFor('getty', [work('a', 'whitney', [1]), work('b', 'getty', [1])], items);
		expect(hangs.map((h) => h.work.id)).toEqual(['b']);
	});

	it('never hangs a piece or a shop that has been taken down', () => {
		const items = [item('getty', 1), item('getty', 2)];
		const works = [work('a', 'getty', [1, 2])];
		const base = { removedAt: '2026-11-01', reason: 'test' };
		const piece: Removal[] = [{ id: 'getty:1', handle: 'piece-1', ...base }];
		const shop: Removal[] = [{ museum: 'getty', ...base }];
		expect(hangsFor('getty', works, visible(items, piece))[0].pieces.map((p) => p.item.id)).toEqual(['getty:2']);
		expect(hangsFor('getty', works, visible(items, shop))).toEqual([]);
	});
});
