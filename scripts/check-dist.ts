// Checks the built site in dist/ after `pnpm build`: every room page exists with one row per
// catalog piece, staging pages carry noindex, and no page shows "undefined", "NaN" or
// "Invalid Date".
// Usage: node scripts/check-dist.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { catalogSchema } from '../src/lib/catalog.ts';
import { museumSchema } from '../src/lib/museums.ts';
import { roomMuseums } from '../src/lib/room.ts';

const DIST = 'dist';
const problems: string[] = [];

const pages = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? pages(path) : path.endsWith('.html') ? [path] : [];
	});

const catalog = catalogSchema.parse(JSON.parse(readFileSync('data/catalog.json', 'utf8')));
const museums = museumSchema.array().parse(parse(readFileSync('data/museums.yaml', 'utf8')));
for (const museum of roomMuseums(museums, catalog)) {
	const path = join(DIST, 'rooms', museum.id, 'index.html');
	let html: string;
	try {
		html = readFileSync(path, 'utf8');
	} catch {
		problems.push(`${path} is missing`);
		continue;
	}
	const rows = html.match(/<li\b[^>]*\bclass="row\b/g)?.length ?? 0;
	const expected = catalog.filter((i) => i.museum === museum.id).length;
	if (rows !== expected) problems.push(`${path} has ${rows} rows, catalog has ${expected}`);
}

// The same test as Base.astro: only the launch hostname may be indexed.
const { default: config } = await import('../astro.config.mjs');
const staging = config.site === undefined || new URL(config.site).hostname !== 'oiloncotton.com';
for (const path of pages(DIST)) {
	const html = readFileSync(path, 'utf8');
	const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
	if (/\bundefined\b|\bNaN\b|Invalid Date/.test(text)) problems.push(`${path} shows "undefined", "NaN" or "Invalid Date"`);
	if (staging && !html.includes('<meta name="robots" content="noindex">')) problems.push(`${path} lacks noindex`);
}

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}
console.log(`dist ok: ${pages(DIST).length} pages checked`);
