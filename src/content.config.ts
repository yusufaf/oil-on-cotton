import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { artistSchema } from './lib/artists';
import { museumSchema } from './lib/museums';

const museums = defineCollection({
	loader: file('data/museums.yaml'),
	schema: museumSchema,
});

const artists = defineCollection({
	loader: file('data/artists.yaml'),
	schema: artistSchema,
});

export const collections = { museums, artists };
