import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'astro/zod';
import { LAUNCH_HOSTNAME } from './site.ts';

// IndexNow tells Bing and the other engines that share it which pages changed, so they recrawl
// them soon instead of whenever they next read the sitemap. Google ignores it.
export const MANIFEST = 'indexnow-pages.json';

export type PageHashes = Record<string, string>; // page URL -> sha256 of what a search engine sees
export interface IndexNowRequest {
	host?: string;
	key?: string;
	urlList: string[];
}

const XML_ENTITIES: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' };

export function sitemapUrls(xml: string): string[] {
	return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) =>
		loc.trim().replace(/&(amp|apos|gt|lt|quot);/g, (_, name: string) => XML_ENTITIES[name]),
	);
}

export function pageFile(distDir: string, url: string): string {
	const pathname = decodeURIComponent(new URL(url).pathname);
	return pathname.endsWith('/') ? join(distDir, pathname, 'index.html') : join(distDir, pathname);
}

// Only what a search engine shows for a page: its title, description, robots and canonical tags, and
// the text in <main>. Inline loader and checklist scripts, scoped styles and build fingerprints (asset
// names under /_astro/, data-astro-cid-* attributes, astro-xxxxxxxx classes) can change with no
// visible text changing, and hashing them would send unchanged pages.
export function pageContent(html: string): string {
	const head = html.match(/<title>[\s\S]*?<\/title>|<meta name="(?:description|robots)"[^>]*>|<link rel="canonical"[^>]*>/g) ?? [];
	const main = html.match(/<main[\s>][\s\S]*<\/main>/)?.[0] ?? html;
	return [...head, main]
		.join('\n')
		.replace(/<script\b[\s\S]*?<\/script>/g, '')
		.replace(/<style\b[\s\S]*?<\/style>/g, '')
		.replace(/\/_astro\/[^"'\s)]+/g, '')
		.replace(/\sdata-astro-cid-[a-z0-9]+(?:="[^"]*")?/g, '')
		.replace(/\bastro-[a-z0-9]{8}\b/g, '');
}

export const pageHash = (html: string): string => createHash('sha256').update(pageContent(html)).digest('hex');

// Changed and new pages, then removed ones. A request may only name URLs on its own host, so a
// removed page left over from another host is dropped.
export function changedUrls(current: PageHashes, previous: PageHashes): string[] {
	const changed = Object.keys(current).filter((url) => current[url] !== previous[url]);
	const host = new URL(Object.keys(current)[0] ?? 'http://invalid').host;
	const removed = Object.keys(previous).filter((url) => !(url in current) && new URL(url).host === host);
	return [...changed, ...removed];
}

// The key is the name of the one <32 lowercase hex>.txt file the site serves.
export const keyFiles = (names: string[]): string[] =>
	names.flatMap((name) => name.match(/^([a-f0-9]{32})\.txt$/)?.[1] ?? []);

const manifestSchema = z.record(z.string(), z.string());
export function parseManifest(value: unknown): PageHashes | undefined {
	const parsed = manifestSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
}

// The manifest the live site serves records what was last deployed. A missing or unreadable copy
// submits every page, which is harmless. The query skips the Pages CDN's ten-minute cache.
export async function livePages(
	origin: string,
	fetchFn: typeof fetch = fetch,
	warn: (message: string) => void = console.warn,
): Promise<PageHashes> {
	try {
		const response = await fetchFn(new URL(`${MANIFEST}?t=${Date.now()}`, origin), { signal: AbortSignal.timeout(10_000) });
		if (response.status === 404) return {};
		if (!response.ok) {
			warn(`${MANIFEST}: HTTP ${response.status}, submitting every page`);
			return {};
		}
		const manifest = parseManifest(await response.json().catch(() => undefined));
		if (manifest) return manifest;
		warn(`${MANIFEST}: not a map of page hashes, submitting every page`);
	} catch (error) {
		warn(`${MANIFEST}: ${error instanceof Error ? error.message : String(error)}, submitting every page`);
	}
	return {};
}

export interface Plan {
	request: IndexNowRequest;
	manifest?: PageHashes;
	skipped?: string;
}

// Hashes every sitemap page and lists the ones that differ from the live manifest. Only a launch
// build plans: previews and forks build for another host and must never submit.
export async function planSubmission(
	distDir: string,
	live: (origin: string) => Promise<PageHashes> = (origin) => livePages(origin),
): Promise<Plan> {
	const sitemap = join(distDir, 'sitemap.xml');
	const urls = sitemapUrls(readFileSync(sitemap, 'utf8'));
	if (urls.length === 0) throw new Error(`${sitemap} lists no pages`);
	const { host, hostname, origin } = new URL(urls[0]);
	if (hostname !== LAUNCH_HOSTNAME) return { request: { urlList: [] }, skipped: `${hostname} is not ${LAUNCH_HOSTNAME}` };
	const keys = keyFiles(readdirSync(distDir));
	if (keys.length !== 1) throw new Error(`expected one IndexNow key file in ${distDir}, found ${keys.length}`);
	const manifest = Object.fromEntries(urls.map((url) => [url, pageHash(readFileSync(pageFile(distDir, url), 'utf8'))]));
	return { request: { host, key: keys[0], urlList: changedUrls(manifest, await live(origin)) }, manifest };
}
