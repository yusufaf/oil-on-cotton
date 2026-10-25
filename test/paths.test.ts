import { describe, expect, it } from 'vitest';
import { href, isCurrent } from '../src/lib/paths';

describe('href', () => {
	it('joins paths onto the base with exactly one slash', () => {
		expect(href()).toBe('/');
		expect(href('favicon.svg')).toBe('/favicon.svg');
		expect(href('/rooms/whitney')).toBe('/rooms/whitney');
	});
});

describe('isCurrent', () => {
	it('ignores a trailing slash on either side', () => {
		expect(isCurrent('/')).toBe(true);
		expect(isCurrent('/rooms/whitney', 'rooms/whitney')).toBe(true);
		expect(isCurrent('/rooms/whitney/', 'rooms/whitney')).toBe(true);
		expect(isCurrent('/rooms/getty', 'rooms/whitney')).toBe(false);
	});
});
