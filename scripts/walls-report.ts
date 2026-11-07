// Converts each Ridgway name in data/ridgway.yaml to its wall colour and prints the wall lines for
// data/museums.yaml, the rows for the DESIGN.md Colors table, and the per-name checks for a PR.
// museums.yaml is read as plain YAML so the report also runs on walls written in an older schema.
// Usage: node scripts/walls-report.ts
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ciede2000, contrastRatio, hexToLab, round1, wallDeltaE, wallFromMunsell } from '../src/lib/colour.ts';
import { relativeLuminance, ridgwaySchema } from '../src/lib/museums.ts';
import { SLOTS } from '../src/lib/plan.ts';

interface RawRoom {
	id: string;
	shop: string;
	automation: string;
	wall: { name: string; hex: string; source: string; text?: string };
}

const TEXT = { 'on-wall': '#F1F3F2', 'on-wall-warm': '#F6F1F1' } as const;

const ridgway = ridgwaySchema.array().parse(parse(readFileSync('data/ridgway.yaml', 'utf8')));
const rooms = parse(readFileSync('data/museums.yaml', 'utf8')) as RawRoom[];
const byName = new Map(ridgway.map((r) => [r.name, r]));
const wall = (name: string) => {
	const entry = byName.get(name);
	if (!entry) throw new Error(`${name} is not in data/ridgway.yaml`);
	const { hex, clipped } = wallFromMunsell(entry.munsell);
	return { entry, hex, clipped, deltaE: wallDeltaE(entry.munsell, hex) };
};
const quote = (s: string) => (/[:#'"]/.test(s) ? `"${s}"` : s);

console.log('data/museums.yaml wall lines:');
for (const room of rooms) {
	const { entry, hex, deltaE } = wall(room.wall.name);
	const text = room.wall.text && room.wall.text !== 'on-wall' ? `, text: ${room.wall.text}` : '';
	console.log(
		`  ${room.id}: wall: { name: ${quote(entry.name)}, hex: "${hex}", source: munsell-hamly-1949, munsell: "${entry.munsell}", deltaE: ${deltaE}${text} }`,
	);
}

console.log('\nDESIGN.md Colors rows:');
for (const slot of SLOTS) {
	const room = rooms.find((r) => r.id === slot.holds);
	if (!room) continue;
	const { entry, hex, deltaE } = wall(room.wall.name);
	const textKey = (room.wall.text ?? 'on-wall') as keyof typeof TEXT;
	const contrast = contrastRatio(TEXT[textKey], hex).toFixed(2);
	const textNote = textKey === 'on-wall' ? '' : ` (${TEXT[textKey]})`;
	const shop = room.automation === 'manual' ? `${room.shop} (hand-listed)` : room.shop;
	console.log(
		`| wall-${room.id} | ${entry.name} | ${entry.munsell} | ${hex} | ${deltaE.toFixed(1)} | ${relativeLuminance(hex).toFixed(3)} | ${contrast}:1${textNote} | ${shop} |`,
	);
}

console.log('\nPer name:');
for (const entry of ridgway) {
	const { hex, clipped, deltaE } = wall(entry.name);
	const scans = entry.scans.map((s) => `${s.at} ${s.hex} ΔE ${round1(ciede2000(hexToLab(s.hex), hexToLab(hex)))}`);
	const was = rooms
		.filter((r) => r.wall.name === entry.name)
		.map((r) =>
			r.wall.source === 'iscc-nbs-centroid'
				? `${r.id} was ${r.wall.hex} (ΔE ${round1(ciede2000(hexToLab(r.wall.hex), hexToLab(hex)))})`
				: `${r.id} n/a`,
		);
	console.log(
		`  ${entry.name}: ${entry.munsell} -> ${hex}, ΔE ${deltaE}${clipped ? ', clipped' : ''}, luminance ${relativeLuminance(hex).toFixed(3)}; ${scans.join('; ')}; ${was.join('; ')}`,
	);
}
