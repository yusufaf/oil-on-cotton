import type { CatalogItem } from './catalog.ts';
import { isOpen, type Museum } from './museums.ts';
import { roomMuseums } from './room.ts';

export interface HomeRoom {
	museum: Museum;
	count: number;
	linked: boolean;
}

export interface Hall {
	open: HomeRoom[];
	closed: Museum[];
}

// The shops the hall shows: open ones in input order, linked when they have a room page, and
// pending ones as closed. A removed shop is in neither.
export function homeRooms(museums: Museum[], items: CatalogItem[], removed: Set<string>): Hall {
	const built = new Set(roomMuseums(museums, items).map((m) => m.id));
	return {
		open: museums
			.filter((m) => isOpen(m) && !removed.has(m.id))
			.map((m) => ({
				museum: m,
				count: items.filter((i) => i.museum === m.id).length,
				linked: built.has(m.id),
			})),
		closed: museums.filter((m) => m.automation === 'pending' && !removed.has(m.id)),
	};
}

export function roomMeta(room: HomeRoom): string {
	return `${room.linked ? `${room.count} pieces · ` : ''}Walls: ${room.museum.wall.name}`;
}

export function closedLine(closed: Museum[]): string {
	return `${new Intl.ListFormat('en-GB').format(closed.map((m) => m.museum))}, while we read their terms`;
}

export type SizeClass = 'L' | 'M' | 'S';

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Slot extends Box {
	holds: string;
	size: SizeClass;
}

export const CLOSED = 'closed';

// DESIGN.md, Floor plan: a fixed layout from the approved spike, in CSS px. Each slot names the
// shop it holds, so the weekly data never moves a room.
export const SHELL = { w: 1100, h: 560, wall: 14 };
export const INNER_WALL = 6;

export const SLOTS: Slot[] = [
	{ holds: 'getty', size: 'L', x: 8, y: 8, w: 518, h: 318 },
	{ holds: 'whitney', size: 'M', x: 640, y: 8, w: 452, h: 318 },
	{ holds: 'lacma', size: 'S', x: 8, y: 320, w: 250, h: 232 },
	{ holds: 'met', size: 'S', x: 252, y: 320, w: 274, h: 232 },
	{ holds: 'moma', size: 'S', x: 640, y: 320, w: 240, h: 232 },
	{ holds: CLOSED, size: 'S', x: 874, y: 320, w: 218, h: 232 },
];

export const DOORS: Box[] = [
	{ x: 520, y: 150, w: 6, h: 64 },
	{ x: 640, y: 150, w: 6, h: 64 },
	{ x: 520, y: 400, w: 6, h: 64 },
	{ x: 640, y: 400, w: 6, h: 64 },
	{ x: 252, y: 400, w: 6, h: 64 },
	{ x: 874, y: 400, w: 6, h: 64 },
	{ x: 300, y: 320, w: 64, h: 6 },
	{ x: 760, y: 320, w: 64, h: 6 },
];

export const ENTRANCE: Box = { x: 548, y: 546, w: 72, h: 14 };

export const LABELS: { text: string; box: Box }[] = [
	{ text: 'Hall', box: { x: 532, y: 120, w: 102, h: 20 } },
	{ text: 'Entrance', box: { x: 532, y: 448, w: 102, h: 20 } },
];

export type Placed =
	| { kind: 'room'; slot: Slot; room: HomeRoom }
	| { kind: 'shop'; slot: Slot; room: HomeRoom }
	| { kind: 'closed'; slot: Slot; closed: Museum[] }
	| { kind: 'empty'; slot: Slot };

// One entry per slot, in SLOTS order. A removed shop leaves its room empty, so the shop is
// never named. Only a museums.yaml change can open a shop the plan has no room for.
export function placeRooms(hall: Hall): Placed[] {
	const missing = hall.open.filter((r) => !SLOTS.some((s) => s.holds === r.museum.id)).map((r) => r.museum.id);
	if (missing.length > 0)
		throw new Error(`The floor plan has no room for: ${missing.join(', ')}. Draw one in SLOTS in src/lib/plan.ts.`);
	const open = new Map(hall.open.map((r) => [r.museum.id, r]));
	return SLOTS.map((slot): Placed => {
		if (slot.holds === CLOSED) return hall.closed.length > 0 ? { kind: 'closed', slot, closed: hall.closed } : { kind: 'empty', slot };
		const room = open.get(slot.holds);
		if (!room) return { kind: 'empty', slot };
		return room.linked ? { kind: 'room', slot, room } : { kind: 'shop', slot, room };
	});
}

// The open shops in the order the plan draws them, for the list under it.
export function planOrder(placed: Placed[]): HomeRoom[] {
	return placed.flatMap((p) => (p.kind === 'room' || p.kind === 'shop' ? [p.room] : []));
}
