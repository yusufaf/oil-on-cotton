// Lists the catalog pieces that match an artist in data/artists.yaml, then those that match
// none, for checking new pieces after a crawl. --unmatched leaves out the matched ones.
// Usage: node scripts/artists-report.ts [--unmatched]
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import { artistSchema, matchArtists } from '../src/lib/artists.ts';
import { catalogSchema } from '../src/lib/catalog.ts';

const { values } = parseArgs({ options: { unmatched: { type: 'boolean', default: false } } });

const artists = artistSchema.array().parse(parse(readFileSync('data/artists.yaml', 'utf8')));
const catalog = catalogSchema.parse(JSON.parse(readFileSync('data/catalog.json', 'utf8')));
const names = new Map(artists.map((a) => [a.id, a.name]));

let matched = 0;
for (const museum of [...new Set(catalog.map((item) => item.museum))].sort()) {
	const rows = catalog
		.filter((item) => item.museum === museum)
		.map((item) => ({ item, ids: matchArtists(item, artists) }));
	const hits = rows.filter((r) => r.ids.length > 0);
	matched += hits.length;
	console.log(`\n${museum}: ${hits.length} of ${rows.length} matched`);
	if (!values.unmatched) {
		for (const { item, ids } of hits) console.log(`  ${item.name}  ->  ${ids.map((id) => names.get(id)).join(', ')}`);
	}
	for (const { item } of rows.filter((r) => r.ids.length === 0)) {
		console.log(`  - ${item.name}${item.tags?.length ? `  [${item.tags.join(', ')}]` : ''}`);
	}
}
console.log(`\n${matched} of ${catalog.length} pieces matched`);
