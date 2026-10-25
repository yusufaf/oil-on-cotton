import { generateKeyPairSync } from 'node:crypto';
import { signerFromJWK } from 'web-bot-auth/crypto';
import { jwkFromSeed } from '../bot/key';
import { Crawler } from '../ingest/crawler';

export const seed = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' }).d!;
export const jwk = jwkFromSeed(seed);

type Route = (request: Request) => Response | Promise<Response>;

// A crawler wired to an in-memory site and a fake clock: sleeping advances time instantly.
export async function fakeCrawler(routes: Record<string, Route | string | number>) {
	let clock = Date.parse('2026-10-25T12:00:00Z');
	const seen: Request[] = [];
	const fetch = async (input: string | URL | Request, init?: RequestInit) => {
		const request = new Request(input, init);
		seen.push(request);
		const url = new URL(request.url);
		const route = routes[url.pathname + url.search] ?? routes[url.pathname] ?? 404;
		if (typeof route === 'number') return new Response(null, { status: route });
		if (typeof route === 'string') return new Response(route, { status: 200 });
		return route(request);
	};
	const crawler = new Crawler({
		signer: await signerFromJWK(jwk),
		signatureAgent: 'https://bot.example',
		fetch: fetch as typeof globalThis.fetch,
		sleep: async (ms) => {
			clock += ms;
		},
		now: () => clock,
		log: () => {},
	});
	return { crawler, seen, advance: (ms: number) => (clock += ms) };
}
