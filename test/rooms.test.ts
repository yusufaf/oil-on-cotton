import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { artistSchema, matchArtists } from '../src/lib/artists';
import { museumSchema } from '../src/lib/museums';

const read = (path: string) => parse(readFileSync(path, 'utf8'));
const rooms: { id: string; lede: string }[] = read('data/rooms.yaml');
const museums = museumSchema.array().parse(read('data/museums.yaml'));
const artists = artistSchema.array().parse(read('data/artists.yaml'));
const fixture: { museum: string; name: string; tags?: string[] }[] = JSON.parse(
	readFileSync('test/fixtures/catalog-2026-10-26.json', 'utf8'),
);

// DESIGN.md, Voice and copy.
const BANNED = /\b(delve|crafting|passionate|seamless|leverage|robust|journey|elevate|empower|unlock|transform|showcase|testament|pivotal|vibrant|meticulous|multifaceted)\b/i;

describe('data/rooms.yaml', () => {
	it('has ledes only for automated shops', () => {
		const auto = new Set(museums.filter((m) => m.automation === 'auto').map((m) => m.id));
		for (const room of rooms) expect(auto.has(room.id), room.id).toBe(true);
	});

	it('uses known slots, and every artist it names is in that room', () => {
		for (const room of rooms) {
			for (const [, slot] of room.lede.matchAll(/\{([^}]*)\}/g)) {
				const artist = slot.match(/^artist:(.+)$/)?.[1];
				if (artist === undefined) {
					expect(['count', 'min', 'max'], `${room.id}: {${slot}}`).toContain(slot);
					continue;
				}
				const pieces = fixture.filter((p) => p.museum === room.id && matchArtists(p, artists).includes(artist));
				expect(pieces.length, `${room.id}: {${slot}}`).toBeGreaterThan(0);
			}
		}
	});

	it('follows the copy rules', () => {
		for (const room of rooms) {
			expect(room.lede, room.id).not.toMatch(/[—!]/);
			expect(room.lede, room.id).not.toMatch(BANNED);
		}
		const openings = rooms.map((r) =>
			r.lede
				.toLowerCase()
				.replace(/[^a-z{}\s]/g, '')
				.split(/\s+/)
				.slice(0, 2)
				.join(' '),
		);
		expect(new Set(openings).size).toBe(openings.length);
	});
});
