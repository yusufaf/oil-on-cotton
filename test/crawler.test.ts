import { describe, expect, it } from 'vitest';
import { verify } from 'web-bot-auth';
import { verifierFromJWK } from 'web-bot-auth/crypto';
import { HostBlockedError, USER_AGENT } from '../ingest/crawler';
import { fakeCrawler, jwk } from './helpers';

const ROBOTS = 'User-agent: *\nDisallow: /cart\n';

describe('Crawler', () => {
	it('signs every request with Web Bot Auth and identifies itself', async () => {
		const { crawler, seen } = await fakeCrawler({ '/robots.txt': ROBOTS, '/a': 'A' });
		await crawler.get('https://shop.example/a');
		const verifier = await verifierFromJWK({ kty: 'OKP', crv: 'Ed25519', x: jwk.x });
		for (const request of seen) {
			expect(request.headers.get('user-agent')).toBe(USER_AGENT);
			const verified = await verify(request, {
				resolver: () => verifier,
				now: new Date('2026-10-25T12:00:10Z'),
			});
			expect(verified.tag).toBe('web-bot-auth');
			expect(verified.signatureAgent?.uri).toBe('https://bot.example');
		}
	});

	it('waits at least a second between requests to the same host', async () => {
		const { crawler } = await fakeCrawler({ '/robots.txt': ROBOTS, '/a': 'A', '/b': 'B' });
		await crawler.get('https://shop.example/a');
		await crawler.get('https://shop.example/b');
		const times = crawler.requests.map((r) => r.at);
		expect(crawler.requests.map((r) => new URL(r.url).pathname)).toEqual(['/robots.txt', '/a', '/b']);
		for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(1000);
	});

	it('honours Crawl-delay when it is longer than a second', async () => {
		const { crawler } = await fakeCrawler({ '/robots.txt': 'User-agent: *\nCrawl-delay: 4', '/a': 'A', '/b': 'B' });
		await crawler.get('https://shop.example/a');
		await crawler.get('https://shop.example/b');
		const [, a, b] = crawler.requests.map((r) => r.at);
		expect(b - a).toBeGreaterThanOrEqual(4000);
	});

	it('refuses paths robots.txt disallows, without requesting them', async () => {
		const { crawler } = await fakeCrawler({ '/robots.txt': ROBOTS });
		await expect(crawler.get('https://shop.example/cart')).rejects.toThrow(HostBlockedError);
		expect(crawler.requests.map((r) => new URL(r.url).pathname)).toEqual(['/robots.txt']);
	});

	it('treats a missing robots.txt as allow-all and an erroring one as disallow-all', async () => {
		const missing = await fakeCrawler({ '/robots.txt': 404, '/a': 'A' });
		expect((await missing.crawler.get('https://shop.example/a')).body).toBe('A');
		const broken = await fakeCrawler({ '/robots.txt': 500, '/a': 'A' });
		await expect(broken.crawler.get('https://shop.example/a')).rejects.toThrow(HostBlockedError);
	});

	it('waits out Retry-After on 429, then gives up after the retry budget', async () => {
		let calls = 0;
		const { crawler } = await fakeCrawler({
			'/robots.txt': ROBOTS,
			'/a': () => (++calls < 2 ? new Response(null, { status: 429, headers: { 'retry-after': '30' } }) : new Response('A')),
			'/b': () => new Response(null, { status: 429, headers: { 'retry-after': '5' } }),
		});
		expect((await crawler.get('https://shop.example/a')).body).toBe('A');
		const [, first, second] = crawler.requests.map((r) => r.at);
		expect(second - first).toBeGreaterThanOrEqual(30_000);
		await expect(crawler.get('https://shop.example/b')).rejects.toThrow(/429 3 times/);
	});

	it('gives up at once when Retry-After is longer than it will wait', async () => {
		const { crawler } = await fakeCrawler({
			'/robots.txt': ROBOTS,
			'/a': () => new Response(null, { status: 429, headers: { 'retry-after': '3600' } }),
		});
		await expect(crawler.get('https://shop.example/a')).rejects.toThrow(HostBlockedError);
		expect(crawler.requests).toHaveLength(2);
	});

	it('follows same-host redirects, re-signing each hop, and refuses cross-host ones', async () => {
		const { crawler, seen } = await fakeCrawler({
			'/robots.txt': ROBOTS,
			'/old': () => new Response(null, { status: 301, headers: { location: '/new' } }),
			'/new': 'NEW',
			'/away': () => new Response(null, { status: 302, headers: { location: 'https://other.example/x' } }),
			'/loop': () => new Response(null, { status: 302, headers: { location: '/loop' } }),
			'/to-cart': () => new Response(null, { status: 302, headers: { location: '/cart' } }),
		});
		expect(await crawler.get('https://shop.example/old')).toMatchObject({ status: 200, body: 'NEW' });
		expect(seen.at(-1)?.headers.get('signature')).not.toBe(seen.at(-2)?.headers.get('signature'));
		await expect(crawler.get('https://shop.example/away')).rejects.toThrow(/cross-host/);
		await expect(crawler.get('https://shop.example/loop')).rejects.toThrow(/too many redirects/);
		await expect(crawler.get('https://shop.example/to-cart')).rejects.toThrow(HostBlockedError);
	});
});
