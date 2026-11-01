import { matchArtists, normalize, type Artist } from './artists.ts';
import type { CatalogItem, garments } from './catalog.ts';
import { isForChildren } from './kids.ts';
import type { Museum } from './museums.ts';

type Garment = (typeof garments)[number];

// The plan's threshold for a room worth a page.
export const MIN_ROOM_PIECES = 8;
// The crawl is weekly and data PRs merge days later, so a 7-day window would hide sales
// between crawls.
export const SALE_FRESH_DAYS = 14;

export function roomMuseums(museums: Museum[], items: CatalogItem[]): Museum[] {
	return museums.filter(
		(m) => m.automation === 'auto' && items.filter((i) => i.museum === m.id).length >= MIN_ROOM_PIECES,
	);
}

const KIND: Record<Garment, string> = {
	tee: 'T-shirt',
	top: 'Top',
	shirt: 'Shirt',
	sweatshirt: 'Sweatshirt',
	hoodie: 'Hoodie',
	sweater: 'Sweater',
	jacket: 'Jacket',
	dress: 'Dress',
	hat: 'Hat',
	scarf: 'Scarf',
	socks: 'Socks',
	tie: 'Tie',
	gloves: 'Gloves',
	onesie: 'Onesie',
};

export function isKids(item: Pick<CatalogItem, 'name' | 'sizes'>): boolean {
	return isForChildren(item.name, item.sizes);
}

export function kindLabel(item: Pick<CatalogItem, 'name' | 'sizes' | 'garment'>): string {
	const kind = KIND[item.garment];
	return item.garment !== 'onesie' && isKids(item) ? `${kind} (kids)` : kind;
}

// The approved spike's filter groups. A group's label grows when a room has the extra kind,
// so a room without tank tops still reads "T-shirts".
export const GROUPS: {
	id: string;
	label: string;
	garments: Garment[];
	wider?: { garment: Garment; label: string };
}[] = [
	{ id: 'tees', label: 'T-shirts', garments: ['tee', 'top'], wider: { garment: 'top', label: 'T-shirts and tops' } },
	{ id: 'sweatshirts', label: 'Sweatshirts', garments: ['sweatshirt', 'sweater'] },
	{ id: 'hoodies', label: 'Hoodies', garments: ['hoodie'] },
	{ id: 'jackets', label: 'Jackets and shirts', garments: ['jacket', 'shirt'] },
	{ id: 'hats', label: 'Hats', garments: ['hat'] },
	{ id: 'scarves', label: 'Scarves and ties', garments: ['scarf', 'tie'] },
	{ id: 'socks', label: 'Socks', garments: ['socks'] },
	{ id: 'other', label: 'Other', garments: ['gloves', 'onesie', 'dress'] },
];

export function groupOf(garment: Garment): string {
	return GROUPS.find((g) => g.garments.includes(garment))!.id;
}

export function groupCounts(items: Pick<CatalogItem, 'garment'>[]) {
	return GROUPS.map(({ wider, ...g }) => ({
		...g,
		label: wider && items.some((i) => i.garment === wider.garment) ? wider.label : g.label,
		count: items.filter((i) => g.garments.includes(i.garment)).length,
	})).filter((g) => g.count > 0);
}

export function dollars(cents: number): string {
	return (cents / 100).toLocaleString('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
	});
}

// "26 October 2026", read in UTC so the build machine's time zone can't shift the day.
export function day(iso: string, withYear = true): string {
	return new Date(iso).toLocaleDateString('en-GB', {
		timeZone: 'UTC',
		day: 'numeric',
		month: 'long',
		...(withYear ? { year: 'numeric' } : {}),
	});
}

export interface Price {
	text: string;
	was?: string;
	saleAsOf?: string;
}

// A sale needs one price and a higher compare-at price; a price range always shows plainly.
export function priceText(item: Pick<CatalogItem, 'price' | 'available' | 'checkedAt'>, now: Date): Price {
	if (!item.available) return { text: 'Sold out' };
	const { min, max, compareAt } = item.price;
	if (min !== max) return { text: `${dollars(min)}–${dollars(max)}` };
	const fresh = now.getTime() - new Date(item.checkedAt).getTime() <= SALE_FRESH_DAYS * 86_400_000;
	if (compareAt !== undefined && compareAt > max && fresh) {
		return { text: dollars(min), was: dollars(compareAt), saleAsOf: day(item.checkedAt, false) };
	}
	return { text: dollars(min) };
}

// "S, M, L · XL sold out". One-size and sold-out pieces get no line: the price says it.
export function sizesLine(item: Pick<CatalogItem, 'sizes' | 'available'>, price: Price): string | undefined {
	const sized = item.sizes.filter((s) => s.label !== 'One size');
	const parts: string[] = [];
	if (price.saleAsOf) parts.push(`On sale as of ${price.saleAsOf}`);
	const inStock = sized.filter((s) => s.available).map((s) => s.label);
	if (item.available && inStock.length > 0) {
		const out = sized.filter((s) => !s.available).map((s) => s.label);
		parts.push(inStock.join(', ') + (out.length > 0 ? ` · ${out.join(', ')} sold out` : ''));
	}
	return parts.length > 0 ? parts.join(' · ') : undefined;
}

// Positions for each sort, worked out here so the browser only compares integers and can't
// order ties or curly quotes differently from the build.
export function sortKeys(items: Pick<CatalogItem, 'id' | 'name' | 'price'>[]) {
	const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
	const position = (sorted: { id: string }[]) => new Map(sorted.map((item, index) => [item.id, index]));
	const asc = position([...items].sort((a, b) => a.price.min - b.price.min || byId(a, b)));
	const desc = position([...items].sort((a, b) => b.price.max - a.price.max || byId(a, b)));
	const name = position(
		[...items].sort((a, b) => {
			const [x, y] = [normalize(a.name), normalize(b.name)];
			return x < y ? -1 : x > y ? 1 : byId(a, b);
		}),
	);
	return new Map(items.map((i) => [i.id, { asc: asc.get(i.id)!, desc: desc.get(i.id)!, name: name.get(i.id)! }]));
}

export interface RoomFacts {
	count: number;
	min: number;
	max: number;
	artists: Map<string, number>;
	knownArtists: Set<string>;
	oldestCheck: string;
}

export function roomFacts(items: CatalogItem[], artists: Artist[]): RoomFacts {
	const counts = new Map<string, number>();
	for (const item of items) {
		for (const id of matchArtists(item, artists)) counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return {
		count: items.length,
		// Over every listed piece, sold out or not, so "none costs more than {max}" stays true.
		min: Math.min(...items.map((i) => i.price.min)),
		max: Math.max(...items.map((i) => i.price.max)),
		artists: counts,
		knownArtists: new Set(artists.map((a) => a.id)),
		oldestCheck: items.map((i) => i.checkedAt).sort()[0],
	};
}

// Ledes are written by hand around slots, so the numbers stay true as the catalog changes:
// {count}, {min}, {max} and {artist:<id>}. A slot that is unknown or comes to zero stops the
// build, because the sentence around it would then be false.
export function fillLede(room: string, template: string, facts: RoomFacts): string {
	return template.replace(/\{([^}]*)\}/g, (_, slot: string) => {
		const fail = (why: string) => {
			throw new Error(`Lede for ${room}: {${slot}} ${why}`);
		};
		if (slot === 'count') return facts.count > 0 ? String(facts.count) : fail('is 0');
		if (slot === 'min') return dollars(facts.min);
		if (slot === 'max') return dollars(facts.max);
		const artist = slot.match(/^artist:(.+)$/)?.[1];
		if (artist === undefined) return fail('is not a known slot');
		if (!facts.knownArtists.has(artist)) return fail('names no artist in data/artists.yaml');
		const n = facts.artists.get(artist) ?? 0;
		return n > 0 ? String(n) : fail('is 0 in this room');
	});
}
