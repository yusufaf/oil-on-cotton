// Parsers for public Shopify storefront HTML and XML. They read facts only; descriptions and
// images may be present in the parsed JSON but are never copied out of these functions.

export class ParseError extends Error {}

export interface Variant {
	id: number;
	options: string[];
	price: number;
	compareAt?: number;
	available?: boolean;
}

export interface ProductPage {
	id: number;
	name: string;
	productType?: string;
	tags?: string[];
	variants: Variant[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
		if (entity[0] === '#') {
			const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
			return Number.isInteger(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
		}
		return ENTITIES[entity.toLowerCase()] ?? match;
	});
}

function attribute(tag: string, name: string): string | undefined {
	const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
	return match ? decodeEntities(match[1] ?? match[2] ?? '') : undefined;
}

function scripts(html: string, type: string): unknown[] {
	const found: unknown[] = [];
	for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
		if (attribute(`<script${attrs}>`, 'type')?.toLowerCase() !== type) continue;
		try {
			found.push(JSON.parse(body));
		} catch {
			// Themes sometimes ship broken JSON; skip it.
		}
	}
	return found;
}

// Pages can carry malformed links; one bad link should cost that link, not the crawl.
function tryUrl(href: string, base: string): URL | undefined {
	try {
		return new URL(href, base);
	} catch {
		return undefined;
	}
}

function tryDecode(component: string): string | undefined {
	try {
		return decodeURIComponent(component);
	} catch {
		return undefined;
	}
}

// Product URLs from a sitemap index's product sitemaps, with their lastmod.
export function parseSitemapIndex(xml: string, origin: string): string[] {
	return [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/g)]
		.map(([, loc]) => tryUrl(decodeEntities(loc.trim()), origin))
		.filter((url) => url?.origin === origin && url.pathname.startsWith('/sitemap_products'))
		.map((url) => url!.href);
}

export function parseProductSitemap(xml: string): Map<string, string> {
	const lastmod = new Map<string, string>();
	for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
		const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
		const modified = Date.parse(block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? '');
		if (!loc || Number.isNaN(modified)) continue;
		// An entry we cannot read just means that product is always refetched.
		const raw = tryUrl(decodeEntities(loc.trim()), 'https://invalid/')?.pathname.match(/^\/products\/([^/]+)$/)?.[1];
		const handle = raw && tryDecode(raw);
		if (handle) lastmod.set(handle, new Date(modified).toISOString());
	}
	return lastmod;
}

export function parseCollectionPage(html: string, pageUrl: string): { handles: string[]; next?: string } {
	const handles = new Set<string>();
	for (const [tag] of html.matchAll(/<a\b[^>]*>/gi)) {
		const href = attribute(tag, 'href');
		const raw = href && tryUrl(href, pageUrl)?.pathname.match(/^(?:\/collections\/[^/]+)?\/products\/([^/?#]+)\/?$/)?.[1];
		const handle = raw && tryDecode(raw);
		if (handle) handles.add(handle);
	}
	const nextTag = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag).find((tag) => attribute(tag, 'rel') === 'next');
	const nextHref = nextTag && attribute(nextTag, 'href');
	return { handles: [...handles], next: nextHref ? tryUrl(nextHref, pageUrl)?.href : undefined };
}

interface MetaProduct {
	id: number;
	type?: string;
	variants: { id: number; price: number; public_title: string | null }[];
}

// Shopify injects `var meta = {...}` (ShopifyAnalytics) on every product page, whatever the theme.
function analyticsMeta(html: string): MetaProduct {
	const json = html.match(/var meta = (\{.*?\});\s*(?:\n|for \(|window\.)/s)?.[1];
	if (!json) throw new ParseError('no ShopifyAnalytics meta');
	const product = (JSON.parse(json) as { product?: MetaProduct }).product;
	if (!product?.id || !Array.isArray(product.variants)) throw new ParseError('meta has no product');
	return product;
}

interface ThemeVariant {
	id: number;
	options?: string[];
	option1?: string | null;
	option2?: string | null;
	option3?: string | null;
	price?: number;
	compare_at_price?: number | null;
	available?: boolean;
}

interface ThemeProduct {
	handle?: string;
	tags?: unknown;
	variants?: unknown;
}

function isThemeVariantList(value: unknown): value is ThemeVariant[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((v) => typeof v === 'object' && v !== null && typeof v.id === 'number' && typeof v.available === 'boolean')
	);
}

// Themes embed the Liquid `product | json` shape in different places. Search the page's JSON
// scripts for a variant list whose ids match the meta variants, and pick up tags beside it.
function themeVariants(html: string, ids: Set<number>, handle: string) {
	let best: { variants: ThemeVariant[]; tags?: string[]; overlap: number } | undefined;
	const visit = (value: unknown, parent: ThemeProduct | undefined, depth: number) => {
		if (depth > 4 || typeof value !== 'object' || value === null) return;
		if (isThemeVariantList(value)) {
			const overlap = value.filter((v) => ids.has(v.id)).length;
			if (overlap > 0 && (!best || overlap > best.overlap)) {
				const tags =
					parent?.handle === handle && Array.isArray(parent.tags) ? parent.tags.filter((t) => typeof t === 'string') : undefined;
				best = { variants: value, tags, overlap };
			}
			return;
		}
		for (const child of Object.values(value)) visit(child, value as ThemeProduct, depth + 1);
	};
	for (const json of scripts(html, 'application/json')) visit(json, undefined, 0);
	return best;
}

interface LdOffer {
	url?: string;
	availability?: string;
}

function ldProduct(html: string): { name?: string; offers: LdOffer[] } | undefined {
	for (const json of scripts(html, 'application/ld+json')) {
		const nodes = Array.isArray(json) ? json : [json];
		for (const node of nodes as Record<string, unknown>[]) {
			if (node?.['@type'] !== 'Product' && node?.['@type'] !== 'ProductGroup') continue;
			const offers = node.offers;
			return {
				name: typeof node.name === 'string' ? node.name : undefined,
				offers: (Array.isArray(offers) ? offers : offers ? [offers] : []) as LdOffer[],
			};
		}
	}
	return undefined;
}

function ldAvailability(offers: LdOffer[]): Map<number, boolean> {
	const byVariant = new Map<number, boolean>();
	for (const offer of offers) {
		const id = offer.url?.match(/[?&]variant=(\d+)/)?.[1];
		if (id && offer.availability) byVariant.set(Number(id), /InStock|LimitedAvailability|OnlineOnly/i.test(offer.availability));
	}
	return byVariant;
}

export function parseProductPage(html: string, handle: string): ProductPage {
	const meta = analyticsMeta(html);
	const ids = new Set(meta.variants.map((v) => v.id));
	const theme = themeVariants(html, ids, handle);
	const themeById = new Map(theme?.variants.map((v) => [v.id, v]));
	const ld = ldProduct(html);
	const ldAvailable = ldAvailability(ld?.offers ?? []);

	const ogTitle = [...html.matchAll(/<meta\b[^>]*>/gi)]
		.map(([tag]) => tag)
		.find((tag) => attribute(tag, 'property') === 'og:title');
	const name = (ogTitle && attribute(ogTitle, 'content')) || ld?.name;
	if (!name) throw new ParseError('no product name');

	const variants = meta.variants.map((mv): Variant => {
		const tv = themeById.get(mv.id);
		const options =
			tv?.options ??
			[tv?.option1, tv?.option2, tv?.option3].filter((o): o is string => typeof o === 'string');
		const compareAt = tv?.compare_at_price ?? undefined;
		return {
			id: mv.id,
			options: options.length > 0 ? options : (mv.public_title ?? '').split(' / ').filter(Boolean),
			price: mv.price,
			compareAt: compareAt && compareAt > mv.price ? compareAt : undefined,
			available: tv?.available ?? ldAvailable.get(mv.id),
		};
	});

	return {
		id: meta.id,
		name: name.trim(),
		productType: meta.type || undefined,
		tags: theme?.tags,
		variants,
	};
}
