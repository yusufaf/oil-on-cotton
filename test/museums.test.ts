import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ciede2000, hexToLab, round1, wallDeltaE, wallFromMunsell } from '../src/lib/colour';
import { museumSchema, relativeLuminance, ridgwaySchema } from '../src/lib/museums';
import { SLOTS } from '../src/lib/plan';

const museums = museumSchema.array().parse(parse(readFileSync('data/museums.yaml', 'utf8')));
const ridgway = ridgwaySchema.array().parse(parse(readFileSync('data/ridgway.yaml', 'utf8')));

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

	it('names the clothing collections of every automated shop', () => {
		for (const m of museums.filter((m) => m.automation === 'auto')) {
			expect(m.apparelCollections.length, m.id).toBeGreaterThan(0);
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

describe('walls (DESIGN.md, Colors)', () => {
	it('paints each wall with the conversion of its Munsell notation', () => {
		for (const m of museums) {
			expect(m.wall.hex, m.id).toBe(wallFromMunsell(m.wall.munsell).hex);
		}
	});

	it('records the ΔE2000 between the notation and the shipped hex', () => {
		for (const m of museums) {
			expect(Math.abs(m.wall.deltaE - wallDeltaE(m.wall.munsell, m.wall.hex)), m.id).toBeLessThan(0.05);
		}
	});

	it('takes every wall from data/ridgway.yaml, and uses every entry there', () => {
		const names = ridgway.map((r) => r.name);
		expect(new Set(names).size).toBe(names.length);
		for (const m of museums) {
			expect(ridgway.find((r) => r.name === m.wall.name)?.munsell, m.id).toBe(m.wall.munsell);
		}
		for (const r of ridgway) {
			expect(museums.some((m) => m.wall.name === r.name), r.name).toBe(true);
		}
	});

	it('cross-checks every name against one SHI and one BHL scan', () => {
		for (const r of ridgway) {
			expect(r.scans.map((s) => s.at).sort(), r.name).toEqual(['bhl', 'shi']);
			const shipped = wallFromMunsell(r.munsell).hex;
			for (const s of r.scans) {
				expect(['digital.sciencehistory.org', 'archive.org'], r.name).toContain(new URL(s.image).hostname);
				const deltaE = round1(ciede2000(hexToLab(s.hex), hexToLab(shipped)));
				expect(Math.abs(s.deltaE - deltaE), `${r.name} ${s.at}`).toBeLessThan(0.05);
			}
		}
	});

	it('keeps every wall within ΔE 5 of its notation', () => {
		for (const m of museums) {
			expect(
				m.wall.deltaE,
				`${m.id}: DESIGN.md: a wall above ΔE 5 is labelled after Ridgway's ${m.wall.name}; that label is not built`,
			).toBeLessThanOrEqual(5);
		}
	});

	it('matches the DESIGN.md wall tokens to the painted rooms', () => {
		const colors: Record<string, string> = parse(readFileSync('DESIGN.md', 'utf8').split(/^---\r?$/m)[1]).colors;
		for (const [key, hex] of Object.entries(colors).filter(([k]) => k.startsWith('wall-'))) {
			const room = museums.find((m) => `wall-${m.id}` === key);
			expect(room?.wall.hex, `DESIGN.md ${key}`).toBe(hex);
		}
		for (const slot of SLOTS.filter((s) => museums.some((m) => m.id === s.holds))) {
			expect(colors, `DESIGN.md wall-${slot.holds}`).toHaveProperty(`wall-${slot.holds}`);
		}
	});
});
