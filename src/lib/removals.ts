import { readFileSync } from 'node:fs';
import { z } from 'astro/zod';
import { parse } from 'yaml';
import type { CatalogItem } from './catalog.ts';

export const REMOVALS = 'data/removals.yaml';

// A takedown removes one piece, or a whole shop. The log is public, so it holds no personal details.
// A piece records its handle too, so the crawler never requests its page again, even once
// catalog.json no longer holds it.
const common = { removedAt: z.iso.date(), reason: z.string().min(1) };

export const removalSchema = z.union([
	z.object({ id: z.string().regex(/^[a-z0-9-]+:\d+$/), handle: z.string().min(1), ...common }).strict(),
	z.object({ museum: z.string().regex(/^[a-z0-9-]+$/), ...common }).strict(),
]);

export type Removal = z.infer<typeof removalSchema>;

export function parseRemovals(yaml: string): Removal[] {
	return removalSchema.array().parse(parse(yaml) ?? []);
}

export const readRemovals = (path = REMOVALS) => parseRemovals(readFileSync(path, 'utf8'));

export const removedIds = (removals: Removal[]) =>
	new Set(removals.flatMap((r) => ('id' in r ? [r.id] : [])));

export const removedMuseums = (removals: Removal[]) =>
	new Set(removals.flatMap((r) => ('museum' in r ? [r.museum] : [])));

export const removedHandles = (removals: Removal[], museum: string) =>
	new Set(removals.flatMap((r) => ('id' in r && r.id.startsWith(`${museum}:`) ? [r.handle] : [])));

export function visible<T extends Pick<CatalogItem, 'id' | 'museum'>>(items: T[], removals: Removal[]): T[] {
	const ids = removedIds(removals);
	const museums = removedMuseums(removals);
	return items.filter((i) => !ids.has(i.id) && !museums.has(i.museum));
}
