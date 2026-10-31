import { z } from 'astro/zod';
import type { CatalogItem } from './catalog';

// A title identifies its artist only at the museum whose shop sells it: "Real Estate" is a
// Lichtenstein at the Whitney and just two words anywhere else.
const workSchema = z
	.object({
		title: z.string().min(1),
		museum: z.string(),
		url: z.url(),
	})
	.strict();

export const artistSchema = z
	.object({
		id: z.string().regex(/^[a-z0-9-]+$/),
		name: z.string().min(1),
		surname: z.string().min(1),
		wikidata: z.string().regex(/^Q\d+$/),
		aliases: z.array(z.string().min(1)).default([]),
		works: z.array(workSchema).default([]),
	})
	.strict();

export type Artist = z.infer<typeof artistSchema>;

export function normalize(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function artistKeys(artist: Artist, museum: string): string[] {
	const titles = artist.works.filter((w) => w.museum === museum).map((w) => w.title);
	// A key that is all punctuation normalizes to "", which equals any all-punctuation tag.
	return [artist.name, ...artist.aliases, ...titles].map(normalize).filter(Boolean);
}

// Keys match the name on word boundaries, or a tag exactly. Surnames are never keys by
// themselves, so "Kelly/Stone Blue" can't become Ellsworth Kelly.
export function matchArtists(item: Pick<CatalogItem, 'museum' | 'name' | 'tags'>, artists: Artist[]): string[] {
	const name = ` ${normalize(item.name)} `;
	const tags = new Set((item.tags ?? []).map(normalize));
	return artists
		.filter((artist) => artistKeys(artist, item.museum).some((key) => name.includes(` ${key} `) || tags.has(key)))
		.map((artist) => artist.id);
}
