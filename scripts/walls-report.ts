// Converts each Ridgway name in data/ridgway.yaml to its wall colour and prints the wall lines for
// data/museums.yaml, the rows for the DESIGN.md Colors table, and the per-name scan checks.
// Usage: node scripts/walls-report.ts
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ciede2000, contrastRatio, hexToLab, round1, wallDeltaE, wallFromMunsell } from '../src/lib/colour.ts';
import { museumSchema, relativeLuminance, ridgwaySchema } from '../src/lib/museums.ts';
import { SLOTS } from '../src/lib/plan.ts';

const ridgway = ridgwaySchema.array().parse(parse(readFileSync('data/ridgway.yaml', 'utf8')));
const rooms = museumSchema.array().parse(parse(readFileSync('data/museums.yaml', 'utf8')));
const colors: Record<string, string> = parse(readFileSync('DESIGN.md', 'utf8').split(/^---\r?$/m)[1]).colors;

const walls = new Map(
	ridgway.map((entry) => {
		const { hex, clipped } = wallFromMunsell(entry.munsell);
		return [entry.name, { entry, hex, clipped, deltaE: wallDeltaE(entry.munsell, hex) }];
	}),
);
const wall = (name: string) => {
	const found = walls.get(name);
	if (!found) throw new Error(`${name} is not in data/ridgway.yaml`);
	return found;
};
const quote = (s: string) => (/[:#'"]/.test(s) ? `"${s}"` : s);

console.log('data/museums.yaml wall lines:');
for (const room of rooms) {
	const { entry, hex, deltaE } = wall(room.wall.name);
	const text = room.wall.text === 'on-wall' ? '' : `, text: ${room.wall.text}`;
	console.log(
		`  ${room.id}: wall: { name: ${quote(entry.name)}, hex: "${hex}", source: munsell-hamly-1949, munsell: "${entry.munsell}", deltaE: ${deltaE}${text} }`,
	);
}

console.log('\nDESIGN.md Colors rows:');
for (const slot of SLOTS) {
	const room = rooms.find((r) => r.id === slot.holds);
	if (!room) continue;
	const { entry, hex, deltaE } = wall(room.wall.name);
	const textHex = colors[room.wall.text];
	if (!textHex) throw new Error(`DESIGN.md has no ${room.wall.text} colour`);
	const contrast = contrastRatio(textHex, hex).toFixed(2);
	const textNote = room.wall.text === 'on-wall' ? '' : ` (${textHex})`;
	const shop = room.automation === 'manual' ? `${room.shop} (hand-listed)` : room.shop;
	console.log(
		`| wall-${room.id} | ${entry.name} | ${entry.munsell} | ${hex} | ${deltaE.toFixed(1)} | ${relativeLuminance(hex).toFixed(3)} | ${contrast}:1${textNote} | ${shop} |`,
	);
}

console.log('\nPer name:');
for (const { entry, hex, clipped, deltaE } of walls.values()) {
	const scans = entry.scans.map((s) => `${s.at} ${s.hex} ΔE ${round1(ciede2000(hexToLab(s.hex), hexToLab(hex)))}`);
	const used = rooms.filter((r) => r.wall.name === entry.name).map((r) => r.id);
	console.log(
		`  ${entry.name}: ${entry.munsell} -> ${hex}, ΔE ${deltaE}${clipped ? ', clipped' : ''}, luminance ${relativeLuminance(hex).toFixed(3)}; ${scans.join('; ')}; ${used.join(', ')}`,
	);
}
