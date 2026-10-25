import { generateNonce, sign, type WebBotSigner } from 'web-bot-auth';
import { allowAll, disallowAll, parseRobots, type Robots } from './robots.ts';

export const PRODUCT_TOKEN = 'OilOnCottonBot';
export const USER_AGENT = `${PRODUCT_TOKEN}/0.1 (+https://github.com/yusufaf/oil-on-cotton#crawler)`;

const THROTTLE_STATUSES = new Set([429, 430, 503]);
const MAX_REDIRECTS = 3;

// The host is throttling us: stop crawling it for this run.
export class HostBlockedError extends Error {}
export class RobotsDisallowedError extends Error {}

export interface Page {
	url: string;
	status: number;
	body: string;
}

export interface CrawlerOptions {
	signer: WebBotSigner;
	signatureAgent: string;
	minGapMs?: number;
	maxRetries?: number;
	maxRetryAfterMs?: number;
	fetch?: typeof globalThis.fetch;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	log?: (line: string) => void;
}

function retryAfterMs(header: string | null, now: number): number | undefined {
	if (!header) return undefined;
	const seconds = Number(header);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const date = Date.parse(header);
	return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export class Crawler {
	readonly requests: { url: string; status: number; at: number }[] = [];
	private readonly robots = new Map<string, Robots>();
	private readonly nextAllowedAt = new Map<string, number>();
	private readonly opts: Required<Omit<CrawlerOptions, 'signer' | 'signatureAgent'>> &
		Pick<CrawlerOptions, 'signer' | 'signatureAgent'>;

	constructor(options: CrawlerOptions) {
		this.opts = {
			minGapMs: 1000,
			maxRetries: 2,
			maxRetryAfterMs: 120_000,
			fetch: globalThis.fetch,
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			now: Date.now,
			log: (line) => console.error(line),
			...options,
		};
	}

	// Throws RobotsDisallowedError for a path robots.txt disallows, HostBlockedError when the host keeps throttling.
	async get(url: string): Promise<Page> {
		const target = new URL(url);
		const robots = await this.robotsFor(target.origin);
		if (!robots.isAllowed(target.pathname + target.search)) {
			throw new RobotsDisallowedError(`robots.txt disallows ${target.pathname}${target.search}`);
		}
		return this.request(target);
	}

	private async robotsFor(origin: string): Promise<Robots> {
		const cached = this.robots.get(origin);
		if (cached) return cached;
		let robots: Robots;
		try {
			const page = await this.request(new URL('/robots.txt', origin));
			// RFC 9309: an unavailable robots.txt (4xx) allows everything; an unreachable one (5xx) allows nothing.
			if (page.status >= 200 && page.status < 300) robots = parseRobots(page.body, PRODUCT_TOKEN);
			else if (page.status >= 400 && page.status < 500) robots = allowAll;
			else robots = disallowAll;
		} catch (error) {
			if (error instanceof HostBlockedError) throw error;
			robots = disallowAll;
		}
		this.robots.set(origin, robots);
		return robots;
	}

	private async request(target: URL, redirects = 0, retries = 0): Promise<Page> {
		const host = target.host;
		const wait = (this.nextAllowedAt.get(host) ?? 0) - this.opts.now();
		if (wait > 0) await this.opts.sleep(wait);

		const response = await this.opts.fetch(target, {
			headers: await this.headers(target),
			redirect: 'manual',
		});
		const at = this.opts.now();
		const delaySeconds = this.robots.get(target.origin)?.crawlDelaySeconds ?? 0;
		this.nextAllowedAt.set(host, at + Math.max(this.opts.minGapMs, delaySeconds * 1000));
		this.requests.push({ url: target.href, status: response.status, at });
		this.opts.log(`${response.status} ${target.href}`);

		if (THROTTLE_STATUSES.has(response.status)) {
			await response.body?.cancel();
			const after = retryAfterMs(response.headers.get('retry-after'), at) ?? 60_000;
			if (retries >= this.opts.maxRetries || after > this.opts.maxRetryAfterMs) {
				throw new HostBlockedError(`${host} answered ${response.status} ${retries + 1} times`);
			}
			this.nextAllowedAt.set(host, at + Math.max(after, this.opts.minGapMs));
			return this.request(target, redirects, retries + 1);
		}

		if (response.status >= 300 && response.status < 400) {
			await response.body?.cancel();
			const location = response.headers.get('location');
			if (!location) return { url: target.href, status: response.status, body: '' };
			const next = new URL(location, target);
			if (next.origin !== target.origin) throw new Error(`cross-origin redirect from ${target.href} to ${next.href}`);
			if (redirects >= MAX_REDIRECTS) throw new Error(`too many redirects from ${target.href}`);
			const robots = this.robots.get(next.origin);
			if (robots && !robots.isAllowed(next.pathname + next.search)) {
				throw new RobotsDisallowedError(`robots.txt disallows ${next.pathname}${next.search}`);
			}
			return this.request(next, redirects + 1);
		}

		return { url: target.href, status: response.status, body: await response.text() };
	}

	private async headers(target: URL): Promise<Headers> {
		const headers = new Headers({
			'user-agent': USER_AGENT,
			accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8',
			'signature-agent': `"${this.opts.signatureAgent}"`,
		});
		const created = new Date(this.opts.now());
		const fields = await sign(
			{ kind: 'request', method: 'GET', targetUri: target.href, fields: [...headers].map(([name, value]) => ({ name, value })) },
			{
				signer: this.opts.signer,
				created,
				expires: new Date(created.getTime() + 60_000),
				nonce: generateNonce(),
			},
		);
		headers.set('signature-input', fields.signatureInput);
		headers.set('signature', fields.signature);
		return headers;
	}
}
