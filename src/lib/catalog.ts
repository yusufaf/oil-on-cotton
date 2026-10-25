import { z } from 'astro/zod';

export const garments = [
	'tee',
	'shirt',
	'sweatshirt',
	'hoodie',
	'sweater',
	'jacket',
	'dress',
	'hat',
	'scarf',
	'socks',
	'tie',
	'gloves',
	'onesie',
] as const;

const cents = z.number().int().nonnegative();

// Facts only. `.strict()` makes the schema reject descriptions, images or any other field.
export const catalogItemSchema = z
	.object({
		id: z.string().regex(/^[a-z0-9-]+:\d+$/),
		museum: z.string(),
		handle: z.string(),
		url: z.url(),
		name: z.string().min(1),
		garment: z.enum(garments),
		price: z.object({ min: cents, max: cents, compareAt: cents.optional() }).strict(),
		sizes: z.array(z.object({ label: z.string(), available: z.boolean() }).strict()).min(1),
		available: z.boolean(),
		productType: z.string().optional(),
		tags: z.array(z.string()).optional(),
		firstSeen: z.iso.datetime(),
		checkedAt: z.iso.datetime(),
	})
	.strict();

export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const catalogSchema = z.array(catalogItemSchema);

export const hostStateSchema = z
	.object({
		lastAttempt: z.iso.datetime(),
		lastSuccess: z.iso.datetime().optional(),
		status: z.enum(['ok', 'error', 'count-drop']),
		error: z.string().optional(),
		requests: z.number().int().nonnegative(),
		items: z.number().int().nonnegative(),
		// Products read and found not to be clothing, keyed by handle, so unchanged ones are not fetched again.
		skipped: z.record(z.string(), z.iso.datetime()),
	})
	.strict();

export type HostState = z.infer<typeof hostStateSchema>;

export const hostsSchema = z.record(z.string(), hostStateSchema);
