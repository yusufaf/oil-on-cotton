import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	changedUrls,
	keyFiles,
	livePages,
	pageFile,
	pageHash,
	parseManifest,
	planSubmission,
	sitemapUrls,
	type PageHashes,
} from '../src/lib/indexnow';

const KEY = '0123456789abcdef0123456789abcdef';
const page = (main: string, head = '<title>Oil on Cotton</title>') =>
	`<!DOCTYPE html><html><head>${head}</head><body><header>nav</header><main>${main}</main><footer>f</footer></body></html>`;

describe('sitemapUrls', () => {
	it("reads every <loc> in this site's sitemap shape", () => {
		const xml =
			'<urlset>\n\t<url><loc>https://oiloncotton.com/</loc></url>\n\t<url><loc>https://oiloncotton.com/rooms/getty/</loc></url>\n</urlset>';
		expect(sitemapUrls(xml)).toEqual(['https://oiloncotton.com/', 'https://oiloncotton.com/rooms/getty/']);
	});

	it('unescapes XML entities', () => {
		expect(sitemapUrls('<loc> https://a.example/?a=1&amp;b=2 </loc>')).toEqual(['https://a.example/?a=1&b=2']);
	});

	it('returns nothing for a sitemap with no pages', () => {
		expect(sitemapUrls('<urlset></urlset>')).toEqual([]);
	});
});

describe('pageFile', () => {
	it('maps directory URLs to their index.html and decodes the path', () => {
		expect(pageFile('dist', 'https://oiloncotton.com/')).toBe(join('dist', 'index.html'));
		expect(pageFile('dist', 'https://oiloncotton.com/rooms/getty/')).toBe(join('dist', 'rooms', 'getty', 'index.html'));
		expect(pageFile('dist', 'https://oiloncotton.com/a%20b.html')).toBe(join('dist', 'a b.html'));
	});
});

describe('pageHash', () => {
	it('ignores everything outside <main> but the search-facing head tags', () => {
		const a = page('<p>Irises</p>').replace('<header>nav</header>', '<header>one</header>');
		const b = page('<p>Irises</p>').replace('<header>nav</header>', '<header>two</header>').replace('<html>', '<html style="--wall:#780027">');
		expect(pageHash(a)).toBe(pageHash(b));
	});

	it('changes when the main text changes, such as a sale label appearing', () => {
		expect(pageHash(page('<p>$45</p>'))).not.toBe(pageHash(page('<p>$38 <s>$45</s></p>')));
	});

	it.each([
		['title', '<title>A</title>', '<title>B</title>'],
		['description', '<meta name="description" content="A">', '<meta name="description" content="B">'],
		['robots', '<meta name="robots" content="index">', '<meta name="robots" content="noindex">'],
		['canonical', '<link rel="canonical" href="https://oiloncotton.com/a/">', '<link rel="canonical" href="https://oiloncotton.com/b/">'],
	])('changes when the %s changes', (_, a, b) => {
		expect(pageHash(page('<p>x</p>', a))).not.toBe(pageHash(page('<p>x</p>', b)));
	});

	it('ignores build fingerprints', () => {
		const a = page('<img src="/_astro/irises.Ab12Cd.avif" data-astro-cid-x7yz12ab class="astro-abcd1234"><p data-astro-cid-x7yz12ab="">x</p>');
		const b = page('<img src="/_astro/irises.Zz99Yy.avif" data-astro-cid-q1w2e3r4 class="astro-wxyz9876"><p data-astro-cid-q1w2e3r4="">x</p>');
		expect(pageHash(a)).toBe(pageHash(b));
	});

	it('ignores inline scripts and styles inside <main>', () => {
		const a = page('<p>x</p><script>start(1)</script><style>.a{}</style>');
		const b = page('<p>x</p><script type="module">start(2)</script><style>.b{}</style>');
		expect(pageHash(a)).toBe(pageHash(b));
	});

	it('hashes the whole page when there is no <main>', () => {
		expect(pageHash('<p>a</p>')).not.toBe(pageHash('<p>b</p>'));
	});
});

describe('changedUrls', () => {
	const u = (p: string) => `https://oiloncotton.com/${p}`;

	it('lists changed and new pages, then removed ones, and skips unchanged ones', () => {
		const previous: PageHashes = { [u('')]: 'a', [u('about/')]: 'b', [u('gone/')]: 'c' };
		const current: PageHashes = { [u('')]: 'a', [u('about/')]: 'B', [u('new/')]: 'd' };
		expect(changedUrls(current, previous)).toEqual([u('about/'), u('new/'), u('gone/')]);
	});

	it('drops removed pages on another host', () => {
		expect(changedUrls({ [u('')]: 'a' }, { [u('')]: 'a', 'https://old.example/x/': 'z' })).toEqual([]);
	});

	it('lists every page on the first run', () => {
		expect(changedUrls({ [u('')]: 'a', [u('about/')]: 'b' }, {})).toEqual([u(''), u('about/')]);
	});
});

describe('keyFiles', () => {
	it('finds only lowercase 32-hex .txt names', () => {
		expect(keyFiles(['robots.txt', 'favicon.svg', `${KEY}.txt`, 'abc.txt', `${KEY.toUpperCase()}.txt`])).toEqual([KEY]);
	});
});

describe('parseManifest', () => {
	it('accepts a map of page hashes', () => {
		expect(parseManifest({ 'https://oiloncotton.com/': 'h' })).toEqual({ 'https://oiloncotton.com/': 'h' });
		expect(parseManifest({})).toEqual({});
	});

	it.each([[[]], [{ a: 1 }], [null], ['x']])('rejects %j', (value) => {
		expect(parseManifest(value)).toBeUndefined();
	});
});

describe('livePages', () => {
	const respond = (body: string, status = 200) =>
		vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(body, { status }));

	it('reads the live manifest past the CDN cache', async () => {
		const fetchFn = respond(JSON.stringify({ 'https://oiloncotton.com/': 'h' }));
		const warn = vi.fn();
		expect(await livePages('https://oiloncotton.com', fetchFn, warn)).toEqual({ 'https://oiloncotton.com/': 'h' });
		expect(String(fetchFn.mock.calls[0][0])).toMatch(/^https:\/\/oiloncotton\.com\/indexnow-pages\.json\?t=\d+$/);
		expect(warn).not.toHaveBeenCalled();
	});

	it('treats a missing manifest as the first run, without a warning', async () => {
		const warn = vi.fn();
		expect(await livePages('https://oiloncotton.com', respond('', 404), warn)).toEqual({});
		expect(warn).not.toHaveBeenCalled();
	});

	it('warns and submits every page on any other failure', async () => {
		for (const [fetchFn, text] of [
			[respond('', 500), 'HTTP 500'],
			[respond('[]'), 'not a map'],
			[respond('not json'), 'not a map'],
			[vi.fn(async () => Promise.reject(new Error('timeout'))), 'timeout'],
		] as const) {
			const warn = vi.fn();
			expect(await livePages('https://oiloncotton.com', fetchFn, warn)).toEqual({});
			expect(warn).toHaveBeenCalledWith(expect.stringContaining(text));
		}
	});
});

describe('planSubmission', () => {
	let dir: string;
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const writeDist = ({ host = 'oiloncotton.com', pages = {} as Record<string, string>, keys = [KEY] } = {}) => {
		dir = mkdtempSync(join(tmpdir(), 'indexnow-'));
		const locs = Object.keys(pages).map((p) => `\t<url><loc>https://${host}/${p}</loc></url>`);
		writeFileSync(join(dir, 'sitemap.xml'), `<urlset>\n${locs.join('\n')}\n</urlset>`);
		for (const [p, html] of Object.entries(pages)) {
			mkdirSync(join(dir, p), { recursive: true });
			writeFileSync(join(dir, p, 'index.html'), html);
		}
		for (const key of keys) writeFileSync(join(dir, `${key}.txt`), key);
	};
	const pages = { '': page('<p>home</p>'), 'rooms/getty/': page('<p>getty</p>') };
	const urls = ['https://oiloncotton.com/', 'https://oiloncotton.com/rooms/getty/'];

	it('submits every page on the first run', async () => {
		writeDist({ pages });
		const live = vi.fn(async () => ({}));
		const { request, manifest } = await planSubmission(dir, live);
		expect(request).toEqual({ host: 'oiloncotton.com', key: KEY, urlList: urls });
		expect(Object.keys(manifest ?? {})).toEqual(urls);
		for (const hash of Object.values(manifest ?? {})) expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(live).toHaveBeenCalledWith('https://oiloncotton.com');
	});

	it('submits nothing when the live site already has these pages', async () => {
		writeDist({ pages });
		const { manifest } = await planSubmission(dir, async () => ({}));
		const { request } = await planSubmission(dir, async () => manifest ?? {});
		expect(request.urlList).toEqual([]);
	});

	it('submits an edited page and a removed one', async () => {
		writeDist({ pages });
		const { manifest } = await planSubmission(dir, async () => ({}));
		rmSync(dir, { recursive: true, force: true });
		writeDist({ pages: { '': page('<p>home, edited</p>') } });
		const { request } = await planSubmission(dir, async () => manifest ?? {});
		expect(request.urlList).toEqual(['https://oiloncotton.com/', 'https://oiloncotton.com/rooms/getty/']);
	});

	it('plans nothing for a build that is not the launch site', async () => {
		writeDist({ host: 'preview.example', pages });
		const live = vi.fn(async () => ({}));
		const plan = await planSubmission(dir, live);
		expect(plan.request).toEqual({ urlList: [] });
		expect(plan.manifest).toBeUndefined();
		expect(plan.skipped).toMatch(/preview\.example/);
		expect(live).not.toHaveBeenCalled();
	});

	it.each([[[]], [[KEY, 'fedcba9876543210fedcba9876543210']]])('needs exactly one key file (%j)', async (keys) => {
		writeDist({ pages, keys });
		await expect(planSubmission(dir, async () => ({}))).rejects.toThrow(/expected one IndexNow key file/);
	});
});
