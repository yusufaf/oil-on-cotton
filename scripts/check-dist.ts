// Checks the built site in dist/ after `pnpm build`: every room page exists with one row per
// catalog piece, staging pages carry noindex, and no page shows "undefined" or "NaN".
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
	const rows = html.match(/<li class="row"/g)?.length ?? 0;
	const expected = catalog.filter((i) => i.museum === museum.id).length;
	if (rows !== expected) problems.push(`${path} has ${rows} rows, catalog has ${expected}`);
}

const config = readFileSync('astro.config.mjs', 'utf8');
const staging = !/site:\s*'https:\/\/oiloncotton\.com'/.test(config);
for (const path of pages(DIST)) {
	const html = readFileSync(path, 'utf8');
	const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
	if (/\bundefined\b|\bNaN\b/.test(text)) problems.push(`${path} shows "undefined" or "NaN"`);
	if (staging && !html.includes('<meta name="robots" content="noindex">')) problems.push(`${path} lacks noindex`);
}

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}
console.log(`dist ok: ${pages(DIST).length} pages checked`);
