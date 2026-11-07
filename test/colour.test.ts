import { readFileSync } from 'node:fs';
import { munsellValueToY } from 'munsell';
import { describe, expect, it } from 'vitest';
import { ciede2000, contrastRatio, D65_WHITE, hexToLab, type Lab, wallFromMunsell, xyzToLab } from '../src/lib/colour';

type Vec3 = [number, number, number];

describe('ciede2000', () => {
	const rows = readFileSync('test/fixtures/ciede2000.txt', 'utf8')
		.split('\n')
		.filter((line) => line.trim() && !line.startsWith('#'))
		.map((line) => line.trim().split(/\s+/).map(Number));

	it('matches all 34 of Sharma et al.’s test pairs', () => {
		expect(rows).toHaveLength(34);
		for (const [L1, a1, b1, L2, a2, b2, dE] of rows) {
			expect(ciede2000([L1, a1, b1], [L2, a2, b2])).toBeCloseTo(dE, 4);
		}
	});
});

describe('hexToLab', () => {
	it('maps white to L* 100 and black to 0', () => {
		const [L, a, b] = hexToLab('#FFFFFF');
		expect(Math.abs(L - 100)).toBeLessThan(1e-3);
		// The 4-dp sRGB matrix and munsell.js's D65 white differ by about 0.013 in a*.
		expect(Math.abs(a)).toBeLessThan(0.02);
		expect(Math.abs(b)).toBeLessThan(0.02);
		for (const c of hexToLab('#000000')) expect(Math.abs(c)).toBeLessThan(1e-9);
	});
});

describe('contrastRatio', () => {
	it('reproduces the DESIGN.md table', () => {
		expect(contrastRatio('#F6F1F1', '#780027').toFixed(2)).toBe('10.27');
		expect(contrastRatio('#F1F3F2', '#343F37').toFixed(2)).toBe('9.85');
	});
});

describe('wallFromMunsell', () => {
	// Renotation grid points from RIT all.dat (h V C x y), Illuminant C. Y comes from ASTM D1535,
	// as munsell.js uses, rather than the file's MgO-relative Y.
	const grid: [string, number, number][] = [
		['5R 3/6', 0.4592, 0.3168],
		['10YR 3/2', 0.3747, 0.363],
		['5G 3/4', 0.2711, 0.378],
		['5PB 3/2', 0.2708, 0.2719],
		['5R 2/10', 0.5557, 0.2633],
		['2.5YR 2/4', 0.4598, 0.3508],
	];
	const WHITE_C: Vec3 = [0.98071, 1, 1.18225];
	const BRADFORD = [
		[0.8951, 0.2664, -0.1614],
		[-0.7502, 1.7135, 0.0367],
		[0.0389, -0.0685, 1.0296],
	];
	const mul = (m: number[][], v: readonly number[]): Vec3 => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) as Vec3;
	const inverse = (m: number[][]): number[][] => {
		const [[a, b, c], [d, e, f], [g, h, i]] = m;
		const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
		return [
			[(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
			[(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
			[(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
		];
	};
	const coneC = mul(BRADFORD, WHITE_C);
	const coneD65 = mul(BRADFORD, D65_WHITE);
	const cToD65 = (xyz: Vec3): Vec3 =>
		mul(
			inverse(BRADFORD),
			mul(BRADFORD, xyz).map((v, i) => (v * coneD65[i]) / coneC[i]),
		);

	it('agrees with the renotation data on grid points', () => {
		for (const [notation, x, y] of grid) {
			const V = Number(notation.split(' ')[1].split('/')[0]);
			const Y = munsellValueToY(V);
			const expected: Lab = xyzToLab(cToD65([(x * Y) / y, Y, ((1 - x - y) * Y) / y]));
			expect(ciede2000(expected, wallFromMunsell(notation).lab), notation).toBeLessThan(0.05);
		}
	});

	it('reads Hamly’s notation formats', () => {
		const slate = wallFromMunsell('N2.6/');
		expect(slate.hex).toMatch(/^#([0-9A-F]{2})\1\1$/);
		expect(slate.clipped).toBe(false);
		expect(wallFromMunsell('5R 2.4/10.0').hex).toMatch(/^#[0-9A-F]{6}$/);
		expect(wallFromMunsell('5R 5/30').clipped).toBe(true);
	});
});
