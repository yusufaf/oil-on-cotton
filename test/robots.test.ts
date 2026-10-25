import { describe, expect, it } from 'vitest';
import { parseRobots } from '../ingest/robots';

const SHOPIFY_LIKE = `
# we use Shopify as our ecommerce platform
User-agent: *
Disallow: /admin
Disallow: /cart
Disallow: /collections/*sort_by*
Disallow: /collections/*+*
Disallow: /*/collections/*sort_by*
Disallow: /search
Allow: /search/about$
Sitemap: https://shop.example.org/sitemap.xml

User-agent: Nutch
Disallow: /

User-agent: AhrefsBot
User-agent: OilOnCottonBot
Crawl-delay: 5
Disallow: /products/secret
`;

describe('parseRobots', () => {
	it('uses the group that names our product token, case-insensitively', () => {
		const robots = parseRobots(SHOPIFY_LIKE, 'oiloncottonbot');
		expect(robots.isAllowed('/products/secret-tee')).toBe(false);
		expect(robots.isAllowed('/admin')).toBe(true);
		expect(robots.crawlDelaySeconds).toBe(5);
	});

	it('falls back to the * group', () => {
		const robots = parseRobots(SHOPIFY_LIKE, 'SomeOtherBot');
		expect(robots.isAllowed('/collections/apparel')).toBe(true);
		expect(robots.isAllowed('/collections/apparel?page=2')).toBe(true);
		expect(robots.isAllowed('/collections/apparel?sort_by=price')).toBe(false);
		expect(robots.isAllowed('/collections/a+b')).toBe(false);
		expect(robots.isAllowed('/en-ca/collections/x?sort_by=1')).toBe(false);
		expect(robots.isAllowed('/products/tee')).toBe(true);
		expect(robots.crawlDelaySeconds).toBeUndefined();
	});

	it('lets the longest match win, and allow win a tie', () => {
		const robots = parseRobots(SHOPIFY_LIKE, 'x');
		expect(robots.isAllowed('/search/about')).toBe(true);
		expect(robots.isAllowed('/search/about/more')).toBe(false);
		const tie = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a', 'x');
		expect(tie.isAllowed('/a')).toBe(true);
	});

	it('keeps user-agent lines in one group across a Sitemap line', () => {
		const robots = parseRobots(
			'User-agent: OilOnCottonBot\nSitemap: https://x/sitemap.xml\nUser-agent: AhrefsBot\nDisallow: /',
			'OilOnCottonBot',
		);
		expect(robots.isAllowed('/products/a')).toBe(false);
	});

	it('allows everything with no matching group or an empty disallow', () => {
		expect(parseRobots('', 'x').isAllowed('/anything')).toBe(true);
		expect(parseRobots('User-agent: *\nDisallow:', 'x').isAllowed('/anything')).toBe(true);
	});

	it('treats regex characters in patterns literally', () => {
		const robots = parseRobots('User-agent: *\nDisallow: /a.b?c', 'x');
		expect(robots.isAllowed('/a.b?c=1')).toBe(false);
		expect(robots.isAllowed('/axb')).toBe(true);
	});
});
