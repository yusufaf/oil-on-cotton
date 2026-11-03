import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../src/lib/catalog';
import { museumSchema, type Museum } from '../src/lib/museums';
import {
	CLOSED,
	DOORS,
	ENTRANCE,
	INNER_WALL,
	SHELL,
	SLOTS,
	closedLine,
	homeRooms,
	placeRooms,
	planOrder,
	roomMeta,
	type Box,
	type Hall,
} from '../src/lib/plan';
import { readRemovals, removedMuseums, visible } from '../src/lib/removals';
import { HALL_PAGES, PLAN_PAGE, PREVIEW_PAGES } from '../src/lib/site';

const museum = (id: string, automation: Museum['automation'], name = `${id} museum`): Museum =>
	({
		id,
		automation,
		shop: `${id} shop`,
		museum: name,
		wall: { name: `${id} wall`, hex: '#36454F', source: 'iscc-nbs-centroid', text: 'on-wall' },
	}) as Museum;

const pieces = (id: string, n: number) =>
	[...Array(n)].map((_, i) => ({ id: `${id}:${i}`, museum: id }) as CatalogItem);

const ids = (rooms: { museum: Museum }[]) => rooms.map((r) => r.museum.id);

const fullHall = (): Hall =>
	homeRooms(
		[museum('getty', 'auto'), museum('whitney', 'auto'), museum('lacma', 'auto'), museum('met', 'manual'), museum('moma', 'manual'), museum('brooklyn', 'pending')],
		[...pieces('getty', 9), ...pieces('whitney', 9), ...pieces('lacma', 9)],
		new Set(),
	);

describe('homeRooms', () => {
	it('lists open shops in input order and links only built rooms', () => {
		const hall = homeRooms(
			[museum('whitney', 'auto'), museum('lacma', 'auto'), museum('met', 'manual')],
			[...pieces('whitney', 8), ...pieces('lacma', 3)],
			new Set(),
		);
		expect(hall.open.map((r) => [r.museum.id, r.count, r.linked])).toEqual([
			['whitney', 8, true],
			['lacma', 3, false],
			['met', 0, false],
		]);
	});

	it('puts pending shops in closed and leaves excluded shops out', () => {
		const hall = homeRooms([museum('getty', 'auto'), museum('brooklyn', 'pending'), museum('aic', 'excluded')], [], new Set());
		expect(ids(hall.open)).toEqual(['getty']);
		expect(hall.closed.map((m) => m.id)).toEqual(['brooklyn']);
	});

	it('leaves removed shops out of the open list and out of closed', () => {
		const hall = homeRooms(
			[museum('getty', 'auto'), museum('lacma', 'auto'), museum('brooklyn', 'pending')],
			pieces('getty', 8),
			new Set(['lacma', 'brooklyn']),
		);
		expect(ids(hall.open)).toEqual(['getty']);
		expect(hall.closed).toEqual([]);
	});
});

describe('room copy', () => {
	it('states the count and the wall, or only the wall without a room', () => {
		const [getty, met] = homeRooms([museum('getty', 'auto'), museum('met', 'manual')], pieces('getty', 92), new Set()).open;
		expect(roomMeta(getty)).toBe('92 pieces · Walls: getty wall');
		expect(roomMeta(met)).toBe('Walls: met wall');
	});

	it('joins two or three museums the British way', () => {
		const [a, b, c] = [museum('a', 'pending', 'A'), museum('b', 'pending', 'B'), museum('c', 'pending', 'C')];
		expect(closedLine([a, b])).toBe('A and B, while we read their terms');
		expect(closedLine([a, b, c])).toBe('A, B and C, while we read their terms');
	});
});

describe('placeRooms', () => {
	it('fills each slot with its shop', () => {
		expect(placeRooms(fullHall()).map((p) => [p.slot.holds, p.kind])).toEqual([
			['getty', 'room'],
			['whitney', 'room'],
			['lacma', 'room'],
			['met', 'shop'],
			['moma', 'shop'],
			[CLOSED, 'closed'],
		]);
	});

	it("leaves a removed shop's slot empty", () => {
		const hall = fullHall();
		hall.open = hall.open.filter((r) => r.museum.id !== 'lacma');
		const lacma = placeRooms(hall).find((p) => p.slot.holds === 'lacma')!;
		expect(lacma).toEqual({ kind: 'empty', slot: lacma.slot });
	});

	it('leaves the closed room empty when nothing is pending', () => {
		const placed = placeRooms({ ...fullHall(), closed: [] });
		expect(placed.find((p) => p.slot.holds === CLOSED)?.kind).toBe('empty');
	});

	it('refuses an open shop that has no room on the plan', () => {
		const hall = fullHall();
		hall.open.push({ museum: museum('brooklyn', 'auto'), count: 0, linked: false });
		expect(() => placeRooms(hall)).toThrow(/no room for: brooklyn/);
	});

	it('lists placed shops in plan order, skipping closed and empty', () => {
		const hall = fullHall();
		hall.open.reverse();
		hall.open = hall.open.filter((r) => r.museum.id !== 'met');
		expect(ids(planOrder(placeRooms(hall)))).toEqual(['getty', 'whitney', 'lacma', 'moma']);
	});

	it('places every open shop in the real data exactly once', () => {
		const museums = museumSchema.array().parse(parse(readFileSync('data/museums.yaml', 'utf8')));
		const removals = readRemovals();
		const items = visible(JSON.parse(readFileSync('data/catalog.json', 'utf8')) as CatalogItem[], removals);
		const hall = homeRooms(museums, items, removedMuseums(removals));
		const placed = ids(planOrder(placeRooms(hall)));
		expect(new Set(placed).size).toBe(placed.length);
		expect([...placed].sort()).toEqual(ids(hall.open).sort());
	});
});

describe('floor plan geometry', () => {
	const inside = (b: Box, outer: Box) => b.x >= outer.x && b.y >= outer.y && b.x + b.w <= outer.x + outer.w && b.y + b.h <= outer.y + outer.h;
	const shell: Box = { x: 0, y: 0, w: SHELL.w, h: SHELL.h };
	const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

	it('draws rooms at DESIGN.md sizes inside the shell', () => {
		for (const slot of SLOTS) {
			if (slot.size === 'L') expect([slot.w, slot.h]).toEqual([518, 318]);
			if (slot.size === 'M') expect([slot.w, slot.h]).toEqual([452, 318]);
			if (slot.size === 'S') {
				expect(slot.h).toBe(232);
				expect(slot.w).toBeGreaterThanOrEqual(218);
				expect(slot.w).toBeLessThanOrEqual(274);
			}
			const margin = SHELL.wall - INNER_WALL;
			expect(inside(slot, { x: margin, y: margin, w: SHELL.w - 2 * margin, h: SHELL.h - 2 * margin })).toBe(true);
		}
	});

	it('meets rooms only along a shared wall', () => {
		for (const [i, a] of SLOTS.entries()) {
			for (const b of SLOTS.slice(i + 1)) {
				const x = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
				const y = overlap(a.y, a.y + a.h, b.y, b.y + b.h);
				expect(Math.min(x, y), `${a.holds} and ${b.holds}`).toBeLessThanOrEqual(INNER_WALL);
			}
		}
	});

	it('cuts every doorway through a wall', () => {
		const bands = (s: Box): Box[] => [
			{ x: s.x, y: s.y, w: INNER_WALL, h: s.h },
			{ x: s.x + s.w - INNER_WALL, y: s.y, w: INNER_WALL, h: s.h },
			{ x: s.x, y: s.y, w: s.w, h: INNER_WALL },
			{ x: s.x, y: s.y + s.h - INNER_WALL, w: s.w, h: INNER_WALL },
		];
		for (const door of DOORS) {
			expect(SLOTS.some((s) => bands(s).some((band) => inside(door, band))), JSON.stringify(door)).toBe(true);
		}
		expect(inside(ENTRANCE, { x: 0, y: SHELL.h - SHELL.wall, w: SHELL.w, h: SHELL.wall })).toBe(true);
		expect(inside(ENTRANCE, shell)).toBe(true);
	});
});

describe('the floor plan page', () => {
	it('is a preview page, apart from the hall pages', () => {
		expect(PREVIEW_PAGES).toContain(PLAN_PAGE);
		expect(PREVIEW_PAGES.filter((p) => HALL_PAGES.includes(p))).toEqual([]);
	});
});
