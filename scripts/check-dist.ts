// Checks the built site in dist/ after `pnpm build`:
// - every room page exists with one row, and one counted shop link, per visible catalog piece
// - the hall pages, 404 page, sitemap and robots.txt exist, and the sitemap lists exactly the
//   hall pages and the rooms
// - staging pages carry noindex and no canonical; on the launch hostname every page but the 404
//   is indexable, with a canonical that matches its sitemap entry, and loads the visit counter
// - hall pages follow DESIGN.md's copy rules, and no page shows "undefined", "NaN" or "Invalid Date"
// Usage: node scripts/check-dist.ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import { catalogSchema } from '../src/lib/catalog.ts';
import { museumSchema } from '../src/lib/museums.ts';
import { parseRemovals, visible } from '../src/lib/removals.ts';
import { roomMuseums } from '../src/lib/room.ts';
import { HALL_PAGES, LAUNCH_HOSTNAME } from '../src/lib/site.ts';

const DIST = 'dist';
const problems: string[] = [];
// DESIGN.md, Voice and copy.
const BANNED =
	/\b(delve|crafting|passionate|seamless|leverage|robust|journey|elevate|empower|unlock|transform|showcase|testament|pivotal|vibrant|meticulous|multifaceted)\b/i;
const NOINDEX = '<meta name="robots" content="noindex">';

const pages = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? pages(path) : path.endsWith('.html') ? [path] : [];
	});
// dist/about/index.html -> 'about/', dist/index.html -> ''
const routeOf = (file: string) =>
	relative(DIST, file)
		.split(sep)
		.join('/')
		.replace(/(^|\/)index\.html$/, '$1');
const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined);

const catalog = visible(
	catalogSchema.parse(JSON.parse(readFileSync('data/catalog.json', 'utf8'))),
	parseRemovals(readFileSync('data/removals.yaml', 'utf8')),
);
const museums = museumSchema.array().parse(parse(readFileSync('data/museums.yaml', 'utf8')));
const rooms = roomMuseums(museums, catalog);
for (const museum of rooms) {
	const path = join(DIST, 'rooms', museum.id, 'index.html');
	const html = read(path);
	if (html === undefined) {
		problems.push(`${path} is missing`);
		continue;
	}
	const expected = catalog.filter((i) => i.museum === museum.id).length;
	const rows = html.match(/<li\b[^>]*\bclass="row\b/g)?.length ?? 0;
	const counted = html.match(/data-umami-event="Outbound"/g)?.length ?? 0;
	if (rows !== expected) problems.push(`${path} has ${rows} rows, catalog has ${expected}`);
	if (counted !== expected) problems.push(`${path} has ${counted} counted shop links, catalog has ${expected}`);
}

const { default: config } = await import('../astro.config.mjs');
if (!config.site) throw new Error('astro.config.mjs has no site');
const site = new URL(config.site);
const base = (config.base ?? '/').replace(/\/?$/, '/');
const urlOf = (route: string) => new URL(base + route, site).href;
// The same test as Base.astro: only the launch hostname may be indexed.
const launch = site.hostname === LAUNCH_HOSTNAME;

for (const file of ['404.html', 'sitemap.xml', 'robots.txt', ...HALL_PAGES.map((r) => `${r}index.html`)]) {
	if (!existsSync(join(DIST, file))) problems.push(`${join(DIST, file)} is missing`);
}

const listed = [...(read(join(DIST, 'sitemap.xml')) ?? '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const indexable = [...HALL_PAGES, ...rooms.map((m) => `rooms/${m.id}/`)].map(urlOf);
const sitemapDiff = [
	...indexable.filter((u) => !listed.includes(u)).map((u) => `misses ${u}`),
	...listed.filter((u) => !indexable.includes(u)).map((u) => `lists ${u}`),
];
if (sitemapDiff.length > 0) problems.push(`sitemap.xml ${sitemapDiff.join(', ')}`);
if (!read(join(DIST, 'robots.txt'))?.includes(`Sitemap: ${urlOf('sitemap.xml')}`))
	problems.push('robots.txt does not point to the sitemap');

for (const path of pages(DIST)) {
	const route = routeOf(path);
	const html = readFileSync(path, 'utf8');
	const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
	const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
	const noindex = html.includes(NOINDEX);
	if (/\bundefined\b|\bNaN\b|Invalid Date/.test(text)) problems.push(`${path} shows "undefined", "NaN" or "Invalid Date"`);
	// Room pages quote shop product names, which follow the shops' own style.
	if (!route.startsWith('rooms/') && (/[—!]/.test(text) || BANNED.test(text)))
		problems.push(`${path} breaks the copy rules (em dash, exclamation mark or banned word)`);

	if (!launch || route === '404.html') {
		if (!noindex) problems.push(`${path} lacks noindex`);
		if (canonical) problems.push(`${path} has a canonical but is not indexable`);
		continue;
	}
	if (noindex) problems.push(`${path} has noindex on the launch hostname`);
	if (canonical !== urlOf(route)) problems.push(`${path} canonical is ${canonical}, expected ${urlOf(route)}`);
	if (!listed.includes(urlOf(route))) problems.push(`${path} is indexable but not in sitemap.xml`);
	if (!/<script[^>]+src="https:\/\/analytics\.oiloncotton\.com\/s\.js"[^>]+data-website-id="[0-9a-f-]{36}"/.test(html))
		problems.push(`${path} does not load the visit counter`);
}

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}
console.log(`dist ok: ${pages(DIST).length} pages checked`);
