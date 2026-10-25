import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { museumSchema } from './lib/museums';

const museums = defineCollection({
	loader: file('data/museums.yaml'),
	schema: museumSchema,
});

export const collections = { museums };
