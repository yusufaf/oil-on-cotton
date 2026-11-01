import { readFileSync } from 'node:fs';
import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';
import { artistSchema } from './lib/artists';
import { catalogItemSchema, hostStateSchema, type CatalogItem } from './lib/catalog';
import { museumSchema } from './lib/museums';
import { readRemovals, visible } from './lib/removals';

const museums = defineCollection({
	loader: file('data/museums.yaml'),
	schema: museumSchema,
});

const artists = defineCollection({
	loader: file('data/artists.yaml'),
	schema: artistSchema,
});

// Takedowns apply at build time, so a data PR opened before a removal can't bring a piece back.
const catalog = defineCollection({
	loader: () =>
		visible(
			JSON.parse(readFileSync('data/catalog.json', 'utf8')) as CatalogItem[],
			readRemovals(),
		),
	schema: catalogItemSchema,
});

// hosts.json is an object keyed by museum id; the file loader turns each key into an entry.
const hosts = defineCollection({
	loader: file('data/hosts.json'),
	schema: hostStateSchema,
});

const rooms = defineCollection({
	loader: file('data/rooms.yaml'),
	schema: z.object({ id: z.string(), lede: z.string().min(1) }).strict(),
});

export const collections = { museums, artists, catalog, hosts, rooms };
