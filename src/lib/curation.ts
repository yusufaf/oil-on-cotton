import { readFileSync } from 'node:fs';
import { z } from 'astro/zod';
import { parse } from 'yaml';
import type { CatalogItem } from './catalog.ts';

export const CURATION = 'data/curation.yaml';

const date = z.iso.date();
const https = z.url({ protocol: /^https$/ });

export const workSchema = z
	.object({
		id: z.string().regex(/^[a-z0-9-]+$/),
		room: z.string().regex(/^[a-z0-9-]+$/),
		artist: z.string().regex(/^[a-z0-9-]+$/),
		name: z.string().min(1),
		artistLine: z.string().min(1),
		title: z.string().min(1),
		date: z.string().min(1),
		kind: z.enum(['painting']),
		collection: z.string().min(1),
		accession: z.string().min(1),
		record: https,
		checked: date,
		image: z
			.object({
				file: z.string().regex(/^[a-z0-9-]+\.(jpg|png)$/),
				source: https,
				licence: z.literal('CC0 1.0'),
				credit: z.string().min(1),
				retrieved: date,
				alt: z.string().min(1),
			})
			.strict(),
		pieces: z
			.array(
				z
					.object({
						id: z.string().regex(/^[a-z0-9-]+:\d+$/),
						label: z.string().min(1),
						verified: date,
					})
					.strict(),
			)
			.min(1),
	})
	.strict();

export type Work = z.infer<typeof workSchema>;

export interface Hang<T> {
	work: Work;
	pieces: { label: string; item: T }[];
}

// The room page, the tests and check-dist all read the file this way. Astro's file() loader
// would turn an unquoted date into a Date, so curation is not a content collection.
export function parseCuration(yaml: string): Work[] {
	return workSchema.array().parse(parse(yaml) ?? []);
}

export const readCuration = (path = CURATION) => parseCuration(readFileSync(path, 'utf8'));

// `items` is the visible catalog, so a piece that was taken down or that the shop dropped
// leaves the label, and a work with no pieces left doesn't hang.
export function hangsFor<T extends Pick<CatalogItem, 'id'>>(room: string, works: Work[], items: T[]): Hang<T>[] {
	const byId = new Map(items.map((i) => [i.id, i]));
	return works
		.filter((w) => w.room === room)
		.map((work) => ({
			work,
			pieces: work.pieces.flatMap((p) => {
				const item = byId.get(p.id);
				return item ? [{ label: p.label, item }] : [];
			}),
		}))
		.filter((h) => h.pieces.length > 0);
}
