// The shop links Umami counts as "Outbound" events (DESIGN.md, checklist-row), read from built HTML.
export interface OutboundLink {
	href?: string;
	target?: string;
	museum?: string;
	item?: string;
	place?: string;
}

export interface OutboundRoom {
	path: string;
	museum: string;
	items: { id: string; url: string }[];
	hung: string[];
}

// Astro escapes only these two in attribute values.
const decode = (value: string) => value.replaceAll('&quot;', '"').replaceAll('&amp;', '&');

export function outboundLinks(html: string): OutboundLink[] {
	// A quoted value may hold a > (Astro escapes only & and ").
	return [...html.matchAll(/<a\b(?:[^>"]|"[^"]*")*>/g)]
		.map(([tag]) => tag)
		.filter((tag) => tag.includes('data-umami-event="Outbound"'))
		.map((tag) => {
			const attrs: Record<string, string | undefined> = {};
			for (const [, name, value] of tag.matchAll(/\s([\w:-]+)="([^"]*)"/g)) attrs[name] = decode(value);
			return {
				href: attrs.href,
				target: attrs.target,
				museum: attrs['data-umami-event-museum'],
				item: attrs['data-umami-event-item'],
				place: attrs['data-umami-event-place'],
			};
		});
}

// One line for each link's first problem, then one for each of the checklist and hang lists when
// they don't name the room's pieces and its hung pieces exactly once each.
export function outboundProblems(links: OutboundLink[], room: OutboundRoom): string[] {
	const { path } = room;
	const byId = new Map(room.items.map((i) => [i.id, i]));
	const problems: string[] = [];
	for (const l of links) {
		const h = l.href ?? '(no href)';
		const piece = l.item === undefined ? undefined : byId.get(l.item);
		if (l.museum !== room.museum) problems.push(`${path} has a shop link to ${h} naming museum ${l.museum ?? '(none)'}`);
		else if (!piece) problems.push(`${path} has a shop link to ${h} naming piece ${l.item ?? '(none)'}, not in its catalog`);
		else if (l.href !== piece.url) problems.push(`${path} has a shop link to ${h} naming ${l.item}, whose page is ${piece.url}`);
		else if (l.target !== '_blank') problems.push(`${path} has a shop link to ${h} that opens in the same tab`);
		else if (l.place !== 'checklist' && l.place !== 'hang')
			problems.push(`${path} has a shop link to ${h} with place ${l.place ?? '(none)'}`);
	}

	const names = (ids: string[]) => (ids.length ? [...ids].sort().join(', ') : 'none');
	const at = (place: string) => links.filter((l) => l.place === place).map((l) => l.item ?? '(none)');
	const ids = room.items.map((i) => i.id);
	const checklist = at('checklist');
	const hang = at('hang');
	if (names(checklist) !== names(ids))
		problems.push(`${path} has checklist shop links for ${names(checklist)}, expected ${names(ids)} once each`);
	if (names(hang) !== names(room.hung))
		problems.push(`${path} has hang shop links for ${names(hang)}, expected ${names(room.hung)}`);
	return problems;
}
