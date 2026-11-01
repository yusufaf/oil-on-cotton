import { z } from 'astro/zod';

export const automation = z.enum(['auto', 'manual', 'pending', 'excluded']);

export const termsVerdict = z.enum(['listed', 'listed-noncommercial', 'excluded', 'unread']);

export const museumSchema = z.object({
	id: z.string().regex(/^[a-z0-9-]+$/),
	shop: z.string(),
	museum: z.string(),
	storeUrl: z.url(),
	platform: z.enum(['shopify', 'magento', 'other']),
	automation,
	affiliate: z.enum(['none', 'never']),
	apparelCollections: z.array(z.string()).default([]),
	terms: z.object({
		mainUrl: z.url().optional(),
		shopUrl: z.url().optional(),
		reviewedAt: z.iso.date(),
		verdict: termsVerdict,
		clause: z.string().optional(),
	}),
	wall: z.object({
		name: z.string(),
		hex: z.string().regex(/^#[0-9A-F]{6}$/),
		source: z.enum(['iscc-nbs-centroid', 'munsell-hamly-1949']),
		// Light text on the wall; red walls take the warm white (DESIGN.md, Colors).
		text: z.enum(['on-wall', 'on-wall-warm']).default('on-wall'),
	}),
});

export type Museum = z.infer<typeof museumSchema>;

export function relativeLuminance(hex: string): number {
	const channel = (i: number) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function isOpen(m: Museum): boolean {
	return m.automation === 'auto' || m.automation === 'manual';
}
