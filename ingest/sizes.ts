import type { Variant } from './shopify.ts';

const ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'One size'];

const ALIASES: Record<string, string> = {
	xxs: 'XXS',
	'xx-small': 'XXS',
	xs: 'XS',
	'x-small': 'XS',
	'extra small': 'XS',
	s: 'S',
	sm: 'S',
	small: 'S',
	m: 'M',
	md: 'M',
	med: 'M',
	medium: 'M',
	l: 'L',
	lg: 'L',
	large: 'L',
	xl: 'XL',
	'x-large': 'XL',
	'extra large': 'XL',
	xxl: '2XL',
	'2xl': '2XL',
	'xx-large': '2XL',
	'2x': '2XL',
	xxxl: '3XL',
	'3xl': '3XL',
	'xxx-large': '3XL',
	'3x': '3XL',
	'4xl': '4XL',
	'5xl': '5XL',
	os: 'One size',
	'o/s': 'One size',
	'one size': 'One size',
	'one size fits all': 'One size',
	'one size fits most': 'One size',
};

const PREFIX = /^(men'?s|women'?s|ladies'?|youth|kids?|toddler)\s+(.+)$/i;
const CHILD = /^(\d{1,2}T|\d{1,2}\s*-\s*\d{1,2}\s*(?:m|mo|months)|\d{1,2}\s*(?:m|mo|months|y|yrs|years))$/i;

// Bare numbers ("2", "10") are children's sizes only on children's clothing; elsewhere they
// could be sock or shoe sizes, so callers say which.
export function normalizeSize(value: string, kids = false): string | undefined {
	const cleaned = value
		.trim()
		.replace(/^size\s+/i, '')
		.replace(/^(adult|unisex)\s+/i, '');
	const key = cleaned.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
	if (ALIASES[key]) return ALIASES[key];
	const combined = key.match(/^([^/]+?)\s*\/\s*([^/]+)$/);
	if (combined && ALIASES[combined[1]] && ALIASES[combined[2]]) return `${ALIASES[combined[1]]}/${ALIASES[combined[2]]}`;
	if (kids && /^\d{1,2}$/.test(key)) return `Kids ${Number(key)}`;
	const prefixed = cleaned.match(PREFIX);
	if (prefixed) {
		const rest = prefixed[2].toLowerCase().replace(/\./g, '');
		if (/^(youth|kids?|toddler)$/i.test(prefixed[1]) && /^\d{1,2}$/.test(rest)) return `Kids ${Number(rest)}`;
		const inner = ALIASES[rest];
		if (inner) return `${prefixed[1][0].toUpperCase()}${prefixed[1].slice(1).toLowerCase()} ${inner}`;
	}
	if (CHILD.test(cleaned)) return cleaned.replace(/\s+/g, ' ').toUpperCase().replace(/MONTHS$/, 'months');
	return undefined;
}

// Children's sizes, by age in years: 6-12 months, then 2T, then Kids 2, and so on.
function childAge(label: string): number | undefined {
	const months = label.match(/(\d+)\s*(M|MO|months)$/i);
	if (months) return Number(months[1]) / 12;
	const years = label.match(/^(\d+)\s*(T|Y|YRS|YEARS)$/i);
	if (years) return Number(years[1]);
	const kids = label.match(/^Kids (\d+)$/);
	return kids ? Number(kids[1]) + 0.5 : undefined;
}

function rank(label: string): number {
	const age = childAge(label);
	if (age !== undefined) return ORDER.length * 2 + age;
	const plain = ORDER.indexOf(label.split('/')[0]);
	// A combined size sits just after its first part: S, S/M, M.
	if (plain !== -1) return plain + (label.includes('/') ? 0.5 : 0);
	const prefixed = ORDER.indexOf(label.slice(label.indexOf(' ') + 1));
	return prefixed === -1 ? ORDER.length * 3 + 100 : ORDER.length + prefixed;
}

// One entry per size, available when any variant in that size is. Variants that differ only
// by colour or style collapse into "One size".
export function sizesOf(variants: Variant[], kids = false): { label: string; available: boolean }[] {
	const sizes = new Map<string, boolean>();
	for (const variant of variants) {
		const label = variant.options.map((o) => normalizeSize(o, kids)).find((s) => s !== undefined);
		if (label) sizes.set(label, (sizes.get(label) ?? false) || variant.available === true);
	}
	if (sizes.size === 0) return [{ label: 'One size', available: variants.some((v) => v.available === true) }];
	return [...sizes]
		.map(([label, available]) => ({ label, available }))
		.sort((a, b) => rank(a.label) - rank(b.label));
}
