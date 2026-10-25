import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { museumSchema, relativeLuminance } from '../src/lib/museums';

const museums = museumSchema.array().parse(parse(readFileSync('data/museums.yaml', 'utf8')));

describe('museums.yaml', () => {
	it('has unique ids', () => {
		const ids = museums.map((m) => m.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('only automates shops whose terms were read and allow listing', () => {
		for (const m of museums.filter((m) => m.automation === 'auto')) {
			expect(['listed', 'listed-noncommercial'], m.id).toContain(m.terms.verdict);
		}
	});

	it('quotes the deciding clause for every excluded or noncommercial verdict', () => {
		for (const m of museums.filter((m) => m.terms.verdict === 'excluded' || m.terms.verdict === 'listed-noncommercial')) {
			expect(m.terms.clause, m.id).toBeTruthy();
		}
	});

	it('keeps excluded shops out of automation', () => {
		for (const m of museums.filter((m) => m.terms.verdict === 'excluded')) {
			expect(m.automation, m.id).toBe('excluded');
		}
	});

	it('never plans affiliate links for noncommercial shops', () => {
		for (const m of museums.filter((m) => m.terms.verdict === 'listed-noncommercial')) {
			expect(m.affiliate, m.id).toBe('never');
		}
	});

	it('paints open rooms dark enough for light text (DESIGN.md: luminance <= 0.10)', () => {
		for (const m of museums.filter((m) => m.automation !== 'excluded')) {
			expect(relativeLuminance(m.wall.hex), m.id).toBeLessThanOrEqual(0.1);
		}
	});
});
