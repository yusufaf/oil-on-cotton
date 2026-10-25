// Weekly crawl of the shops whose terms allow it. Usage:
//   node ingest/run.ts [--museum <id>]... [--limit <n>] [--dry-run] [--smoke]
// Needs WEB_BOT_AUTH_KEY (base64url Ed25519 seed); BOT_SIGNATURE_AGENT overrides the key directory origin.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { signerFromJWK } from 'web-bot-auth/crypto';
import { parse } from 'yaml';
import { jwkFromSeed } from '../bot/key.ts';
import { catalogSchema, hostsSchema, type CatalogItem } from '../src/lib/catalog.ts';
import { museumSchema } from '../src/lib/museums.ts';
import { crawlMuseum } from './catalog.ts';
import { Crawler } from './crawler.ts';

const CATALOG = 'data/catalog.json';
const HOSTS = 'data/hosts.json';

const { values } = parseArgs({
	options: {
		museum: { type: 'string', multiple: true },
		limit: { type: 'string' },
		'dry-run': { type: 'boolean', default: false },
		smoke: { type: 'boolean', default: false },
	},
});

const seed = process.env.WEB_BOT_AUTH_KEY;
if (!seed) {
	console.error('WEB_BOT_AUTH_KEY is not set. The crawler never sends unsigned requests.');
	process.exit(2);
}

const museums = museumSchema
	.array()
	.parse(parse(readFileSync('data/museums.yaml', 'utf8')))
	.filter((m) => m.automation === 'auto' && m.platform === 'shopify')
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
		for (const path of ['/sitemap.xml', `/collections/${museum.apparelCollections[0]}`]) {
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
const catalog = catalogSchema.parse(readJson(CATALOG) ?? []);
const hosts = hostsSchema.parse(readJson(HOSTS) ?? {});
const now = new Date().toISOString();
const limit = values.limit === undefined ? undefined : Number(values.limit);

let next: CatalogItem[] = catalog.filter((i) => !museums.some((m) => m.id === i.museum));
for (const museum of museums) {
	console.error(`${museum.id}: crawling`);
	const result = await crawlMuseum(
		crawler,
		museum,
		catalog.filter((i) => i.museum === museum.id),
		hosts[museum.id],
		{ now, limit },
	);
	next = next.concat(result.items);
	hosts[museum.id] = result.host;
	console.error(`${museum.id}: ${result.host.status}, ${result.items.length} items, ${result.host.requests} requests`);
}

next.sort((a, b) => a.id.localeCompare(b.id));
if (values['dry-run']) {
	console.log(JSON.stringify({ items: next.length, hosts }, null, 2));
} else {
	writeFileSync(CATALOG, JSON.stringify(next, null, '\t') + '\n');
	writeFileSync(HOSTS, JSON.stringify(Object.fromEntries(Object.entries(hosts).sort()), null, '\t') + '\n');
}
if (Object.values(hosts).some((h) => h.status !== 'ok')) process.exitCode = 1;
