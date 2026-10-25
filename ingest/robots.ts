interface Rule {
	allow: boolean;
	pattern: string;
	regex: RegExp;
}

export interface Robots {
	isAllowed(pathAndQuery: string): boolean;
	crawlDelaySeconds?: number;
}

function toRegex(pattern: string): RegExp {
	const anchored = pattern.endsWith('$');
	const body = (anchored ? pattern.slice(0, -1) : pattern)
		.split('*')
		.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
		.join('.*');
	return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

// RFC 9309. Groups naming our product token apply; otherwise the `*` groups do.
// The longest matching pattern wins, and allow wins a tie.
export function parseRobots(text: string, productToken: string): Robots {
	const token = productToken.toLowerCase();
	const groups: { agents: string[]; rules: Rule[]; crawlDelay?: number }[] = [];
	let current: (typeof groups)[number] | undefined;
	let lastWasAgent = false;

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*/, '').trim();
		const colon = line.indexOf(':');
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim().toLowerCase();
		const value = line.slice(colon + 1).trim();

		if (key === 'user-agent') {
			if (!current || !lastWasAgent) {
				current = { agents: [], rules: [] };
				groups.push(current);
			}
			current.agents.push(value.toLowerCase());
			lastWasAgent = true;
			continue;
		}
		lastWasAgent = false;
		if (!current) continue;
		if (key === 'allow' || key === 'disallow') {
			if (value === '') continue;
			current.rules.push({ allow: key === 'allow', pattern: value, regex: toRegex(value) });
		} else if (key === 'crawl-delay') {
			const delay = Number(value);
			if (Number.isFinite(delay) && delay >= 0) current.crawlDelay = delay;
		}
	}

	const named = groups.filter((g) => g.agents.includes(token));
	const applicable = named.length > 0 ? named : groups.filter((g) => g.agents.includes('*'));
	const rules = applicable.flatMap((g) => g.rules);
	const delays = applicable.flatMap((g) => (g.crawlDelay === undefined ? [] : [g.crawlDelay]));

	return {
		crawlDelaySeconds: delays.length > 0 ? Math.max(...delays) : undefined,
		isAllowed(pathAndQuery) {
			let best: Rule | undefined;
			for (const rule of rules) {
				if (!rule.regex.test(pathAndQuery)) continue;
				if (
					!best ||
					rule.pattern.length > best.pattern.length ||
					(rule.pattern.length === best.pattern.length && rule.allow)
				) {
					best = rule;
				}
			}
			return best?.allow ?? true;
		},
	};
}

export const allowAll: Robots = { isAllowed: () => true };
export const disallowAll: Robots = { isAllowed: () => false };
