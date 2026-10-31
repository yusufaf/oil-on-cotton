import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { artistKeys, artistSchema, matchArtists, normalize, type Artist } from '../src/lib/artists';
import { museumSchema } from '../src/lib/museums';

const artists = artistSchema.array().parse(parse(readFileSync('data/artists.yaml', 'utf8')));
const museums = museumSchema.array().parse(parse(readFileSync('data/museums.yaml', 'utf8')));

const artist = (id: string, name: string, extra: Partial<Artist> = {}): Artist => ({
	id,
	name,
	wikidata: 'Q1',
	aliases: [],
	works: [],
	...extra,
});

const piece = (name: string, tags?: string[], museum = 'whitney') => ({ museum, name, tags });

describe('normalize', () => {
	it('drops accents, case and punctuation', () => {
		expect(normalize('Albrecht Dürer - Stag Beetle')).toBe('albrecht durer stag beetle');
		expect(normalize('Basquiat “Crown” Bucket Hat')).toBe('basquiat crown bucket hat');
		expect(normalize('Ohhh... Alright...')).toBe('ohhh alright');
		expect(normalize('Cathedral #2')).toBe('cathedral 2');
	});

	it('keeps letters that have no accent to strip, in any script', () => {
		expect(normalize('Søren Kierkegaard')).toBe('søren kierkegaard');
		expect(normalize('草間彌生 Dots')).toBe('草間彌生 dots');
	});
});

describe('matchArtists', () => {
	const durer = artist('albrecht-durer', 'Albrecht Dürer', { aliases: ['Dürer'] });
	const calder = artist('alexander-calder', 'Alexander Calder', { aliases: ['Calder'] });
	const cezanne = artist('paul-cezanne', 'Paul Cézanne', { aliases: ['cezane'] });
	const redon = artist('odilon-redon', 'Odilon Redon', { aliases: ['Redon'] });
	const basquiat = artist('jean-michel-basquiat', 'Jean-Michel Basquiat', { aliases: ['Basquiat'] });
	const kelly = artist('ellsworth-kelly', 'Ellsworth Kelly');
	const lichtenstein = artist('roy-lichtenstein', 'Roy Lichtenstein', {
		works: [{ title: 'Real Estate', museum: 'whitney', url: 'https://example.org/real-estate' }],
	});

	it('matches a name or alias regardless of accents and quotes', () => {
		expect(matchArtists(piece('Albrecht Durer Socks'), [durer])).toEqual(['albrecht-durer']);
		expect(matchArtists(piece('Dürer Stag Beetle Socks'), [durer])).toEqual(['albrecht-durer']);
		expect(matchArtists(piece('Basquiat “Crown” Bucket Hat'), [basquiat])).toEqual(['jean-michel-basquiat']);
		expect(matchArtists(piece('Jean-Michel Basquiat Jacket'), [basquiat])).toEqual(['jean-michel-basquiat']);
	});

	it('matches whole words only', () => {
		expect(matchArtists(piece('Caldera Wool Scarf'), [calder])).toEqual([]);
		expect(matchArtists(piece('Calder Clown Hoodie'), [calder])).toEqual(['alexander-calder']);
	});

	it('matches a tag only when it equals a key', () => {
		expect(matchArtists(piece('Scarf', ['redon']), [redon])).toEqual(['odilon-redon']);
		expect(matchArtists(piece('Socks', ['cezane']), [cezanne])).toEqual(['paul-cezanne']);
		expect(matchArtists(piece('Scarf', ['Redon exhibition']), [redon])).toEqual([]);
		expect(matchArtists(piece('Tee', ['Art & Artists']), [redon, basquiat])).toEqual([]);
	});

	it('matches a work title only at the museum that sells it', () => {
		expect(matchArtists(piece('Real Estate Graphic T-shirt'), [lichtenstein])).toEqual(['roy-lichtenstein']);
		expect(matchArtists(piece('Real Estate Graphic T-shirt', [], 'getty'), [lichtenstein])).toEqual([]);
	});

	it('never matches a bare surname that is not listed as a key', () => {
		expect(matchArtists(piece('Simple Rib Knit Beanie - Kelly/Stone Blue'), [kelly])).toEqual([]);
		expect(matchArtists(piece('Ellsworth Kelly Blue Panel Tee'), [kelly])).toEqual(['ellsworth-kelly']);
	});

	it('never matches an all-punctuation key to an all-punctuation tag', () => {
		expect(matchArtists(piece('Scarf', ['—']), [artist('nobody', '…', { aliases: ['#'] })])).toEqual([]);
	});

	it('returns every artist once, in list order', () => {
		const both = piece('Redon and Basquiat Scarf', ['redon', 'Basquiat']);
		expect(matchArtists(both, [basquiat, redon])).toEqual(['jean-michel-basquiat', 'odilon-redon']);
	});
});

describe('artists.yaml', () => {
	const museumIds = new Set(museums.map((m) => m.id));
	// Words that name too many things to identify an artist alone.
	const generic = new Set(['love', 'untitled', 'crown', 'flag', 'hollywood', 'heads', 'self portrait']);

	it('has unique ids and Wikidata items', () => {
		for (const field of ['id', 'wikidata'] as const) {
			const values = artists.map((a) => a[field]);
			expect(new Set(values).size, field).toBe(values.length);
		}
	});

	it('cites an https source for every work at a museum that exists', () => {
		for (const a of artists) {
			for (const w of a.works) {
				expect(w.url, `${a.id}: ${w.title}`).toMatch(/^https:\/\//);
				expect(museumIds.has(w.museum), `${a.id}: ${w.museum}`).toBe(true);
			}
		}
	});

	it('gives no two artists the same key at the same museum', () => {
		for (const museum of museumIds) {
			const owner = new Map<string, string>();
			for (const a of artists) {
				for (const key of new Set(artistKeys(a, museum))) {
					expect(owner.get(key) ?? a.id, `"${key}" at ${museum}`).toBe(a.id);
					owner.set(key, a.id);
				}
			}
		}
	});

	it('has no key too short or too generic to identify an artist', () => {
		for (const a of artists) {
			for (const museum of museumIds) {
				for (const key of artistKeys(a, museum)) {
					expect(key.length, `${a.id}: "${key}"`).toBeGreaterThanOrEqual(4);
					expect(generic.has(key), `${a.id}: "${key}"`).toBe(false);
				}
			}
		}
	});
});

describe('matches on the 2026-10-26 catalog', () => {
	it('stay as reviewed', async () => {
		const fixture: { museum: string; name: string; tags?: string[] }[] = JSON.parse(
			readFileSync('test/fixtures/catalog-2026-10-26.json', 'utf8'),
		);
		const lines = fixture.map((p) => `${p.museum} | ${p.name} | ${matchArtists(p, artists).join(', ')}`);
		await expect(lines.join('\n') + '\n').toMatchFileSnapshot('__snapshots__/artist-matches.txt');
	});
});
