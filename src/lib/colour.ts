// Colour maths for the Ridgway walls (DESIGN.md, Colors). Munsell to XYZ comes from munsell.js,
// built on the RIT renotation data; Lab, CIEDE2000 and contrast are computed here.
import { munsellToHex, munsellToRgb255, munsellToXyz } from 'munsell';
import { relativeLuminance } from './museums.ts';

export type Lab = [number, number, number];
type Vec3 = readonly [number, number, number];

// munsell.js ILLUMINANT_D65, so both sides of every wall ΔE share one white.
export const D65_WHITE: Vec3 = [0.950428061568676, 1, 1.08891545904089];

const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

export function xyzToLab(xyz: Vec3, white: Vec3 = D65_WHITE): Lab {
	const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
	const [fx, fy, fz] = xyz.map((v, i) => f(v / white[i]));
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// IEC 61966-2-1 sRGB to XYZ (D65).
const SRGB_TO_XYZ = [
	[0.4124, 0.3576, 0.1805],
	[0.2126, 0.7152, 0.0722],
	[0.0193, 0.1192, 0.9505],
] as const;

export function hexToLab(hex: string): Lab {
	const linear = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const xyz = SRGB_TO_XYZ.map((row) => row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2]) as unknown as Vec3;
	return xyzToLab(xyz);
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

// Sharma, Wu and Dalal (2005), equations 1-23, with kL = kC = kH = 1.
export function ciede2000([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
	const Cab = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
	const G = 0.5 * (1 - Math.sqrt(Cab ** 7 / (Cab ** 7 + 25 ** 7)));
	const a1p = (1 + G) * a1;
	const a2p = (1 + G) * a2;
	const C1p = Math.hypot(a1p, b1);
	const C2p = Math.hypot(a2p, b2);
	const hue = (b: number, ap: number) => (b === 0 && ap === 0 ? 0 : (deg(Math.atan2(b, ap)) + 360) % 360);
	const h1p = hue(b1, a1p);
	const h2p = hue(b2, a2p);

	const dLp = L2 - L1;
	const dCp = C2p - C1p;
	let dhp = 0;
	if (C1p * C2p !== 0) {
		dhp = h2p - h1p;
		if (dhp > 180) dhp -= 360;
		else if (dhp < -180) dhp += 360;
	}
	const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

	const Lbp = (L1 + L2) / 2;
	const Cbp = (C1p + C2p) / 2;
	let hbp = h1p + h2p;
	if (C1p * C2p !== 0) {
		if (Math.abs(h1p - h2p) <= 180) hbp /= 2;
		else hbp = h1p + h2p < 360 ? (hbp + 360) / 2 : (hbp - 360) / 2;
	}

	const T =
		1 -
		0.17 * Math.cos(rad(hbp - 30)) +
		0.24 * Math.cos(rad(2 * hbp)) +
		0.32 * Math.cos(rad(3 * hbp + 6)) -
		0.2 * Math.cos(rad(4 * hbp - 63));
	const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
	const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
	const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
	const SC = 1 + 0.045 * Cbp;
	const SH = 1 + 0.015 * Cbp * T;
	const RT = -Math.sin(rad(2 * dTheta)) * RC;

	return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

// WCAG 2 contrast ratio.
export function contrastRatio(a: string, b: string): number {
	const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

export function wallFromMunsell(notation: string): { hex: string; lab: Lab; clipped: boolean } {
	return {
		hex: munsellToHex(notation).toUpperCase(),
		lab: xyzToLab(munsellToXyz(notation)),
		clipped: munsellToRgb255(notation, false).some((c) => c < 0 || c > 255),
	};
}

export const round1 = (x: number) => Math.round(x * 10) / 10;

// ΔE2000 between the unclipped renotation colour and the shipped 8-bit hex (DESIGN.md, Colors).
export function wallDeltaE(notation: string, hex: string): number {
	return round1(ciede2000(wallFromMunsell(notation).lab, hexToLab(hex)));
}
