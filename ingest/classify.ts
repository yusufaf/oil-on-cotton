import type { garments } from '../src/lib/catalog.ts';

export type Garment = (typeof garments)[number];

// Earlier entries win when two patterns end at the same place: "hooded sweatshirt" is a hoodie,
// and "t-shirt" is a tee, not a shirt. `undefined` marks things that are not clothing.
const KINDS: [Garment | undefined, RegExp][] = [
	['hoodie', /\b(hoodie|hoody|hooded (sweatshirt|pullover))\b/gi],
	['tee', /\b(t-?shirt|tee|tank top|long ?sleeve)s?\b/gi],
	['sweatshirt', /\b(sweatshirt|crewneck|crew neck|quarter-zip|pullover)s?\b/gi],
	['sweater', /\b(sweater|cardigan|jumper)s?\b/gi],
	['jacket', /\b(jacket|coat|vest|kimono|robe)s?\b/gi],
	['dress', /\b(dress|dresses|skirt)s?\b/gi],
	['shirt', /\b(shirt|button-?down|blouse|polo)s?\b/gi],
	['hat', /\b(hat|cap|beanie|visor)s?\b/gi],
	['scarf', /\b(scarf|scarves|bandana|shawl)s?\b/gi],
	['socks', /\b(sock|socks)\b/gi],
	[
		undefined,
		/\b(key ?chain|keyring|pin|patch|magnet|ornament|tote|bag|pouch|backpack|mug|book|card|puzzle|toy|plush|crown|umbrella|wallet|earring|necklace|bracelet|brooch|sunglasses|chess set)(e?s)?\b/gi,
	],
];

// The noun that ends a product name says what it is: "Hat Pin" is a pin, "Pin Stripe Hat" a hat.
export function garmentOf(name: string): Garment | undefined {
	let best: { kind: Garment | undefined; end: number } | undefined;
	for (const [kind, pattern] of KINDS) {
		for (const match of name.matchAll(pattern)) {
			const end = match.index + match[0].length;
			if (!best || end > best.end) best = { kind, end };
		}
	}
	return best?.kind;
}
