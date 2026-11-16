// Weekly crawl of the shops whose terms allow it. Usage:
//   node ingest/run.ts [--museum <id>]... [--limit <n>] [--refresh] [--dry-run] [--smoke]
//     [--report <file>] [--base <catalog.json>]
// --report writes the rows that left the catalog since --base (default: the stored catalog).
// Needs WEB_BOT_AUTH_KEY (base64url Ed25519 seed); BOT_SIGNATURE_AGENT overrides the key directory origin.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { signerFromJWK } from 'web-bot-auth/crypto';
import { parse } from 'yaml';
import { jwkFromSeed } from '../bot/key.ts';
import { catalogSchema, hostsSchema, type CatalogItem } from '../src/lib/catalog.ts';
import { readCuration } from '../src/lib/curation.ts';
import { museumSchema } from '../src/lib/museums.ts';
import { readRemovals, removedHandles, removedIds, removedMuseums, visible } from '../src/lib/removals.ts';
import { crawlMuseum, goneReport, hostsFile, leftSince, type Gone } from './catalog.ts';
import { Crawler } from './crawler.ts';

const CATALOG = 'data/catalog.json';
const HOSTS = 'data/hosts.json';

const { values } = parseArgs({
	options: {
		museum: { type: 'string', multiple: true },
		limit: { type: 'string' },
		'dry-run': { type: 'boolean', default: false },
		refresh: { type: 'boolean', default: false },
		smoke: { type: 'boolean', default: false },
		report: { type: 'string' },
		base: { type: 'string' },
	},
});

const limit = values.limit === undefined ? undefined : Number(values.limit);
if (limit !== undefined && !(Number.isInteger(limit) && limit >= 0)) {
	console.error(`--limit must be a whole number, got ${values.limit}`);
	process.exit(2);
}

const seed = process.env.WEB_BOT_AUTH_KEY;
if (!seed) {
	console.error('WEB_BOT_AUTH_KEY is not set. The crawler never sends unsigned requests.');
	process.exit(2);
}

const removals = readRemovals();
const excluded = removedMuseums(removals);
for (const id of values.museum ?? []) {
	if (excluded.has(id)) console.error(`${id}: excluded by a takedown in data/removals.yaml, not crawled`);
}
const museums = museumSchema
	.array()
	.parse(parse(readFileSync('data/museums.yaml', 'utf8')))
	.filter((m) => m.automation === 'auto' && m.platform === 'shopify')
	.filter((m) => !excluded.has(m.id))
	.filter((m) => !values.museum || values.museum.includes(m.id));

const crawler = new Crawler({
	signer: await signerFromJWK(jwkFromSeed(seed)),
	signatureAgent: process.env.BOT_SIGNATURE_AGENT || 'https://bot.oiloncotton.com',
});

if (values.smoke) {
	// A handful of requests per shop to see whether this network is throttled.
	let failed = false;
	for (const museum of museums) {
		const origin = new URL(museum.storeUrl).origin;
		if (museum.apparelCollections.length === 0) {
			failed = true;
			console.error(`  ${museum.id}: no apparelCollections in museums.yaml`);
		}
		for (const path of museum.apparelCollections.slice(0, 1).map((c) => `/collections/${c}`)) {
			try {
				const page = await crawler.get(origin + path);
				if (page.status !== 200) failed = true;
			} catch (error) {
				failed = true;
				console.error(`  ${museum.id}: ${error instanceof Error ? error.message : error}`);
				break;
			}
		}
	}
	console.log(failed ? 'smoke: FAIL' : 'smoke: ok');
	process.exit(failed ? 1 : 0);
}

const readJson = (path: string) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined);
// Taken-down pieces leave catalog.json on the first run after their removal, even one that
// crawls no shop, and a shop that fails can't hand them back.
const stored = catalogSchema.parse(readJson(CATALOG) ?? []);
const catalog = visible(stored, removals);
// A --base that isn't there would make the report claim nothing left, so it stops the run.
if (values.base !== undefined && !existsSync(values.base)) {
	console.error(`--base ${values.base} does not exist`);
	process.exit(2);
}
const base = values.base === undefined ? stored : catalogSchema.parse(readJson(values.base));
const shown = new Set(visible(base, removals).map((i) => i.id));
const takenDown = new Set(base.map((i) => i.id).filter((id) => !shown.has(id)));
const hosts = hostsSchema.parse(readJson(HOSTS) ?? {});
for (const id of excluded) delete hosts[id];
const now = new Date().toISOString();

let next: CatalogItem[] = [...catalog];
// Written after every shop, so a run cut short (say by the job timeout) keeps what it finished.
const save = () => {
	if (values['dry-run']) return;
	next.sort((a, b) => a.id.localeCompare(b.id));
	writeFileSync(CATALOG, JSON.stringify(next, null, '\t') + '\n');
	writeFileSync(HOSTS, hostsFile(hosts));
};

const gone: Gone[] = [];
for (const museum of museums) {
	console.error(`${museum.id}: crawling`);
	const result = await crawlMuseum(
		crawler,
		museum,
		catalog.filter((i) => i.museum === museum.id),
		hosts[museum.id],
		{
			now,
			limit,
			refresh: values.refresh,
			removed: { ids: removedIds(removals), handles: removedHandles(removals, museum.id) },
		},
	);
	next = next.filter((i) => i.museum !== museum.id).concat(result.items);
	hosts[museum.id] = result.host;
	gone.push(...result.gone);
	console.error(`${museum.id}: ${result.host.status}, ${result.items.length} items, ${result.host.requests} requests`);
	save();
}
save();
// Written in --dry-run too: it is not data. Before the exit code, so a failed shop still gets one.
if (values.report) writeFileSync(values.report, goneReport(leftSince(base, next, gone, takenDown), readCuration()));

if (values['dry-run']) console.log(JSON.stringify({ items: next.length, hosts }, null, 2));
if (museums.some((m) => hosts[m.id]?.status !== 'ok')) process.exitCode = 1;
