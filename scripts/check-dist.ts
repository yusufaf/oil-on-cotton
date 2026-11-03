// Checks the built site in dist/ after `pnpm build`:
// - every room page exists with one row per visible catalog piece, and one counted shop link per
//   row and per hung piece
// - every hung work shows its accession number and has a 1280w AVIF; no hang source image ships
// - every page keeps to DESIGN.md's performance budget: under 42 KB of first-party JS (inline, local
//   files and their imports; the Lighthouse job holds third-party transfer, the visit counter, to
//   8 KB, 50 KB in all), at most 4 font files its text can need, and every image it shows is in
//   dist and at most 200 KB; the visit counter is its only remote script
// - the hall pages, 404 page, sitemap and robots.txt exist, and the sitemap lists exactly the
//   hall pages and the rooms
// - the floor-plan page links each built room once and nothing else as a plan room, names every
//   open shop and never a removed one
// - staging pages carry noindex and no canonical; on the launch hostname every page but the 404 and
//   the preview pages is indexable, with a canonical that matches its sitemap entry; only launch
//   builds load the visit counter
// - hall pages follow DESIGN.md's copy rules, and no page shows "undefined", "NaN" or "Invalid Date"
// Usage: node scripts/check-dist.ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import {
	FONT_FILE_BUDGET,
	IMAGE_BUDGET,
	JS_BUDGET,
	fontFiles,
	imageUrls,
	isRemote,
	pageCss,
	scriptBytes,
} from '../src/lib/budget.ts';
import { catalogSchema } from '../src/lib/catalog.ts';
import { hangsFor, readCuration } from '../src/lib/curation.ts';
import { museumSchema } from '../src/lib/museums.ts';
import { homeRooms } from '../src/lib/plan.ts';
import { readRemovals, removedMuseums, visible } from '../src/lib/removals.ts';
import { roomMuseums } from '../src/lib/room.ts';
import { HALL_PAGES, LAUNCH_HOSTNAME, PLAN_PAGE, PREVIEW_PAGES } from '../src/lib/site.ts';

const DIST = 'dist';
const problems: string[] = [];
// DESIGN.md, Voice and copy.
const BANNED =
	/\b(delve|crafting|passionate|seamless|leverage|robust|journey|elevate|empower|unlock|transform|showcase|testament|pivotal|vibrant|meticulous|multifaceted)\b/i;
const NOINDEX = '<meta name="robots" content="noindex">';
const COUNTER = 'https://analytics.oiloncotton.com/s.js';
const kb = (bytes: number) => (bytes / 1024).toFixed(1);

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

const { default: config } = await import('../astro.config.mjs');
if (!config.site) throw new Error('astro.config.mjs has no site');
const site = new URL(config.site);
const base = (config.base ?? '/').replace(/\/?$/, '/');
// Asset URLs carry the base (a preview under a sub-path); dist/ does not.
const fileOf = (url: string) =>
	join(DIST, ...url.replace(/[?#].*$/, '').slice(url.startsWith(base) ? base.length : 0).split('/').filter(Boolean));
const readAsset = (url: string) => (isRemote(url) ? undefined : read(fileOf(url)));

const removals = readRemovals();
const catalog = visible(catalogSchema.parse(JSON.parse(readFileSync('data/catalog.json', 'utf8'))), removals);
const museums = museumSchema.array().parse(parse(readFileSync('data/museums.yaml', 'utf8')));
const rooms = roomMuseums(museums, catalog);
const works = readCuration();
const hanging = new Set<string>();
for (const museum of rooms) {
	const path = join(DIST, 'rooms', museum.id, 'index.html');
	const html = read(path);
	if (html === undefined) {
		problems.push(`${path} is missing`);
		continue;
	}
	const items = catalog.filter((i) => i.museum === museum.id);
	const expected = items.length;
	const rows = html.match(/<li\b[^>]*\bclass="row\b/g)?.length ?? 0;
	const counted = html.match(/data-umami-event="Outbound"/g)?.length ?? 0;
	const hangs = hangsFor(museum.id, works, items);
	const hung = hangs.reduce((n, h) => n + h.pieces.length, 0);
	for (const h of hangs) hanging.add(h.work.id);
	if (rows !== expected) problems.push(`${path} has ${rows} rows, catalog has ${expected}`);
	if (counted !== expected + hung)
		problems.push(`${path} has ${counted} counted shop links, expected ${expected} rows and ${hung} hung pieces`);

	const hang = html.match(/<section class="hang"[\s\S]*?<\/section>/)?.[0] ?? '';
	if (hangs.length > 0 && !hang) problems.push(`${path} has no hang section`);
	if (hangs.length === 0 && hang) problems.push(`${path} has a hang section but nothing hangs`);
	for (const { work } of hangs) {
		if (!hang.includes(work.accession)) problems.push(`${path} does not show ${work.id}'s accession ${work.accession}`);
	}
	const sources = [...hang.matchAll(/<source type="image\/avif" srcset="([^"]+)"/g)].map((m) => m[1]);
	if (sources.length !== hangs.length || sources.some((s) => !/ 1280w\b/.test(s)))
		problems.push(`${path} has a hung work without a 1280w AVIF`);
}

// A hung work ships only its resized files. A work that hangs nowhere (its pieces are gone, or
// its room isn't built) only warns, so data PRs can't fail on it; Astro still ships its source,
// a CC0 file at an unlinked URL.
const assets = existsSync(join(DIST, '_astro')) ? readdirSync(join(DIST, '_astro')) : [];
for (const work of works) {
	if (!hanging.has(work.id)) {
		console.warn(`${work.id} hangs nowhere; remove it from data/curation.yaml with its image`);
		continue;
	}
	const stem = work.image.file.replace(/\.\w+$/, '');
	const sources = assets.filter((name) => name.startsWith(`${stem}.`) && /\.(jpe?g|png)$/.test(name));
	if (sources.length > 0) problems.push(`dist/_astro ships the source image ${sources.join(', ')}`);
}

// The floor plan: each built room is one plan-room link, every open shop is named, and a removed
// shop never is (DESIGN.md, Floor plan).
const planPath = join(DIST, PLAN_PAGE, 'index.html');
const planHtml = read(planPath);
if (planHtml !== undefined) {
	const planLinks = [...planHtml.matchAll(/<a\b[^>]*\bclass="[^"]*\bplan-room\b[^"]*"[^>]*>/g)].map(
		([tag]) => tag.match(/\shref="([^"]*)"/)?.[1] ?? '',
	);
	const roomLinks = rooms.map((m) => `${base}rooms/${m.id}/`);
	if (planLinks.length !== new Set(planLinks).size || [...planLinks].sort().join() !== [...roomLinks].sort().join())
		problems.push(`${planPath} links ${planLinks.join(', ') || 'no rooms'} as plan rooms, expected ${roomLinks.join(', ')}`);
	const removedShops = removedMuseums(removals);
	const planText = planHtml.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
	for (const { museum } of homeRooms(museums, catalog, removedShops).open) {
		if (!planText.includes(museum.shop)) problems.push(`${planPath} does not name ${museum.shop}`);
	}
	for (const m of museums.filter((m) => removedShops.has(m.id))) {
		if (planText.includes(m.shop) || planText.includes(m.museum)) problems.push(`${planPath} names ${m.shop}, which was taken down`);
	}
}

// A piece the shop dropped leaves its label quietly; say so, so the entry can be tidied.
const shown = new Set(catalog.map((i) => i.id));
const missing = works.flatMap((w) => w.pieces.filter((p) => !shown.has(p.id)).map((p) => `${w.id}: ${p.id}`));
if (missing.length > 0) console.warn(`curation.yaml lists pieces not in the visible catalog: ${missing.join(', ')}`);

const urlOf = (route: string) => new URL(base + route, site).href;
// The same test as Base.astro: only the launch hostname may be indexed.
const launch = site.hostname === LAUNCH_HOSTNAME;

for (const file of [
	'404.html',
	'sitemap.xml',
	'robots.txt',
	...[...HALL_PAGES, ...PREVIEW_PAGES].map((r) => `${r}index.html`),
]) {
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

let maxJs = 0;
let maxFonts = 0;
const checkedImages = new Set<string>();
for (const path of pages(DIST)) {
	const route = routeOf(path);
	const html = readFileSync(path, 'utf8');
	const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
	const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
	const noindex = html.includes(NOINDEX);
	const counter = /<script[^>]+src="https:\/\/analytics\.oiloncotton\.com\/s\.js"[^>]+data-website-id="[0-9a-f-]{36}"/.test(html);
	// The counter loads on every launch page, 404 included, and on no other build.
	if (counter !== launch) problems.push(`${path} ${launch ? 'does not load' : 'loads'} the visit counter`);
	if (/\bundefined\b|\bNaN\b|Invalid Date/.test(text)) problems.push(`${path} shows "undefined", "NaN" or "Invalid Date"`);
	// Room pages quote shop product names, which follow the shops' own style.
	if (!route.startsWith('rooms/') && (/[—!]/.test(text) || BANNED.test(text)))
		problems.push(`${path} breaks the copy rules (em dash, exclamation mark or banned word)`);

	// DESIGN.md, Accessibility and performance.
	const js = scriptBytes(html, base + route, readAsset);
	const styles = pageCss(html, readAsset);
	for (const url of [...js.missing, ...styles.missing]) problems.push(`${path} loads ${url}, which is not in dist`);
	for (const url of js.remote.filter((u) => u !== COUNTER)) problems.push(`${path} loads the remote script ${url}`);
	if (js.bytes >= JS_BUDGET)
		problems.push(`${path} has ${kb(js.bytes)} KB of first-party JS, over its ${JS_BUDGET / 1024} KB share of the 50 KB budget`);
	const fonts = fontFiles(styles.css, text);
	if (fonts.length > FONT_FILE_BUDGET)
		problems.push(`${path} can load ${fonts.length} font files, over the budget of ${FONT_FILE_BUDGET}: ${fonts.join(', ')}`);
	maxJs = Math.max(maxJs, js.bytes);
	maxFonts = Math.max(maxFonts, fonts.length);
	for (const url of imageUrls(html)) {
		if (checkedImages.has(url)) continue;
		checkedImages.add(url);
		// An inline data: image has no file; its encoded length is at least its decoded size.
		if (url.startsWith('data:')) {
			if (url.length > IMAGE_BUDGET) problems.push(`${path} has a ${kb(url.length)} KB inline image, over the 200 KB budget`);
			continue;
		}
		const file = fileOf(url);
		if (isRemote(url)) problems.push(`${path} shows the remote image ${url}`);
		else if (!existsSync(file)) problems.push(`${path} uses ${url}, which is not in dist`);
		else if (statSync(file).size > IMAGE_BUDGET)
			problems.push(`${url} is ${kb(statSync(file).size)} KB, over the 200 KB budget`);
	}

	if (!launch || route === '404.html' || PREVIEW_PAGES.includes(route)) {
		if (!noindex) problems.push(`${path} lacks noindex`);
		if (canonical) problems.push(`${path} has a canonical but is not indexable`);
		continue;
	}
	if (noindex) problems.push(`${path} has noindex on the launch hostname`);
	if (canonical !== urlOf(route)) problems.push(`${path} canonical is ${canonical}, expected ${urlOf(route)}`);
	if (!listed.includes(urlOf(route))) problems.push(`${path} is indexable but not in sitemap.xml`);
}

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}
console.log(
	`dist ok: ${pages(DIST).length} pages checked; the most any page has is ${kb(maxJs)} KB of JS and ${maxFonts} font files`,
);
