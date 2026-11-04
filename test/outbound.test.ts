import { describe, expect, it } from 'vitest';
import { type OutboundLink, outboundLinks, outboundProblems } from '../src/lib/outbound';

describe('outboundLinks', () => {
	it('reads href, target, museum, item and place from a checklist link', () => {
		const html =
			'<li><a href="https://shop.getty.edu/products/getty-pride-tank-top" target="_blank" rel="nofollow noopener" data-umami-event="Outbound" data-umami-event-museum="getty" data-umami-event-item="getty:8252278538432" data-umami-event-place="checklist" data-astro-cid-4tn6w3f6>Pride tank top</a></li>';
		expect(outboundLinks(html)).toEqual([
			{
				href: 'https://shop.getty.edu/products/getty-pride-tank-top',
				target: '_blank',
				museum: 'getty',
				item: 'getty:8252278538432',
				place: 'checklist',
			},
		]);
	});

	it('finds every Outbound link, whatever the attribute order', () => {
		const html =
			'<a href="https://shop.example/a" target="_blank" data-umami-event="Outbound" data-umami-event-museum="getty" data-umami-event-item="getty:1" data-umami-event-place="checklist">A</a>' +
			'<a data-umami-event="Outbound" data-umami-event-place="hang" data-umami-event-item="getty:2" data-umami-event-museum="getty" target="_blank" href="https://shop.example/b">B</a>';
		expect(outboundLinks(html)).toEqual([
			{ href: 'https://shop.example/a', target: '_blank', museum: 'getty', item: 'getty:1', place: 'checklist' },
			{ href: 'https://shop.example/b', target: '_blank', museum: 'getty', item: 'getty:2', place: 'hang' },
		]);
	});

	it('ignores links that are not Outbound', () => {
		expect(outboundLinks('<a href="/about/">About</a><a href="#" data-umami-event="Other">x</a>')).toEqual([]);
	});

	it('leaves a missing attribute undefined', () => {
		const html =
			'<a href="https://shop.example/a" target="_blank" data-umami-event="Outbound" data-umami-event-museum="getty" data-umami-event-item="getty:1">A</a>';
		const [l] = outboundLinks(html);
		expect(l).toEqual({ href: 'https://shop.example/a', target: '_blank', museum: 'getty', item: 'getty:1' });
		expect(l.place).toBeUndefined();
	});

	it('decodes the entities Astro writes in attribute values', () => {
		const html = '<a href="https://shop.example/p?a=1&amp;b=&quot;x&quot;" data-umami-event="Outbound">P</a>';
		expect(outboundLinks(html)[0].href).toBe('https://shop.example/p?a=1&b="x"');
	});

	it('reads past a > inside an attribute value', () => {
		const html =
			'<a href="https://shop.example/p?q=a>b" target="_blank" data-umami-event="Outbound" data-umami-event-museum="getty" data-umami-event-item="getty:1" data-umami-event-place="hang">P</a>';
		expect(outboundLinks(html)).toEqual([
			{ href: 'https://shop.example/p?q=a>b', target: '_blank', museum: 'getty', item: 'getty:1', place: 'hang' },
		]);
	});
});

describe('outboundProblems', () => {
	const path = 'dist/rooms/getty/index.html';
	const a = { id: 'getty:1', url: 'https://shop.example/products/a' };
	const b = { id: 'getty:2', url: 'https://shop.example/products/b?variant=1&size=m' };
	const room = { path, museum: 'getty', items: [a, b], hung: ['getty:2'] };
	const link = (item: { id: string; url: string }, place: string, over: Partial<OutboundLink> = {}): OutboundLink => ({
		href: item.url,
		target: '_blank',
		museum: 'getty',
		item: item.id,
		place,
		...over,
	});
	const good = [link(a, 'checklist'), link(b, 'checklist'), link(b, 'hang')];
	const withFirst = (l: OutboundLink) => [l, ...good.slice(1)];
	const withLast = (l: OutboundLink) => [...good.slice(0, 2), l];

	it('passes links that match the catalog and the hang', () => {
		expect(outboundProblems(good, room)).toEqual([]);
	});

	it('flags a missing or wrong museum', () => {
		expect(outboundProblems(withFirst(link(a, 'checklist', { museum: undefined })), room)).toEqual([
			`${path} has a shop link to ${a.url} naming museum (none)`,
		]);
		expect(outboundProblems(withFirst(link(a, 'checklist', { museum: 'lacma' })), room)).toEqual([
			`${path} has a shop link to ${a.url} naming museum lacma`,
		]);
	});

	it('flags a piece that is not in the room', () => {
		expect(outboundProblems(withFirst(link(a, 'checklist', { item: 'getty:9' })), room)).toEqual([
			`${path} has a shop link to ${a.url} naming piece getty:9, not in its catalog`,
			`${path} has checklist shop links for getty:2, getty:9, expected getty:1, getty:2 once each`,
		]);
		expect(outboundProblems(withFirst(link(a, 'checklist', { item: undefined })), room)).toEqual([
			`${path} has a shop link to ${a.url} naming piece (none), not in its catalog`,
			`${path} has checklist shop links for (none), getty:2, expected getty:1, getty:2 once each`,
		]);
	});

	it('flags a missing href or a link to the page of another piece', () => {
		expect(outboundProblems(withFirst(link(a, 'checklist', { href: b.url })), room)).toEqual([
			`${path} has a shop link to ${b.url} naming getty:1, whose page is ${a.url}`,
		]);
		expect(outboundProblems(withFirst(link(a, 'checklist', { href: undefined })), room)).toEqual([
			`${path} has a shop link to (no href) naming getty:1, whose page is ${a.url}`,
		]);
	});

	it('flags a link that opens in the same tab', () => {
		expect(outboundProblems(withLast(link(b, 'hang', { target: undefined })), room)).toEqual([
			`${path} has a shop link to ${b.url} that opens in the same tab`,
		]);
		expect(outboundProblems(withLast(link(b, 'hang', { target: '_self' })), room)).toEqual([
			`${path} has a shop link to ${b.url} that opens in the same tab`,
		]);
	});

	it('flags a missing or unknown place', () => {
		expect(outboundProblems(withFirst(link(a, 'checklist', { place: undefined })), room)).toEqual([
			`${path} has a shop link to ${a.url} with place (none)`,
			`${path} has checklist shop links for getty:2, expected getty:1, getty:2 once each`,
		]);
		expect(outboundProblems(withFirst(link(a, 'checklist', { place: 'lede' })), room)).toEqual([
			`${path} has a shop link to ${a.url} with place lede`,
			`${path} has checklist shop links for getty:2, expected getty:1, getty:2 once each`,
		]);
	});

	it('flags a checklist that names a piece twice', () => {
		expect(outboundProblems([link(a, 'checklist'), link(a, 'checklist'), link(b, 'hang')], room)).toEqual([
			`${path} has checklist shop links for getty:1, getty:1, expected getty:1, getty:2 once each`,
		]);
	});

	it('flags a hang that names the wrong piece', () => {
		expect(outboundProblems(withLast(link(a, 'hang')), room)).toEqual([
			`${path} has hang shop links for getty:1, expected getty:2`,
		]);
	});

	it('flags a hang link when nothing hangs', () => {
		expect(outboundProblems(good, { ...room, hung: [] })).toEqual([
			`${path} has hang shop links for getty:2, expected none`,
		]);
	});
});
