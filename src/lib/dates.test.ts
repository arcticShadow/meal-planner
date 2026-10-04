import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, describeDate, fromISODate, startOfWeek, toISODate } from './dates';

describe('toISODate', () => {
	it('formats the local calendar day, not the UTC one', () => {
		// The bug this guards: Date.toISOString() on a local-midnight Date
		// returns the previous day anywhere ahead of UTC, silently shifting
		// every meal back a day.
		expect(toISODate(new Date(2026, 2, 30, 0, 0, 0))).toBe('2026-03-30');
		expect(toISODate(new Date(2026, 2, 30, 23, 59, 59))).toBe('2026-03-30');
	});
});

describe('fromISODate', () => {
	it('round-trips with toISODate', () => {
		for (const iso of ['2026-01-01', '2026-02-28', '2026-12-31', '2024-02-29']) {
			expect(toISODate(fromISODate(iso))).toBe(iso);
		}
	});
});

describe('addDays', () => {
	it('crosses month and year boundaries', () => {
		expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('handles a leap year', () => {
		expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
		expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
	});

	it('survives a daylight-saving transition', () => {
		// NZDT ends on 2026-04-05; a naive +24h would land back on the 4th.
		expect(addDays('2026-04-04', 1)).toBe('2026-04-05');
		expect(addDays('2026-04-05', 1)).toBe('2026-04-06');
		// Northern-hemisphere spring forward.
		expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
	});
});

describe('daysBetween', () => {
	it('counts whole days in both directions', () => {
		expect(daysBetween('2026-03-02', '2026-03-05')).toBe(3);
		expect(daysBetween('2026-03-05', '2026-03-02')).toBe(-3);
		expect(daysBetween('2026-03-02', '2026-03-02')).toBe(0);
	});

	it('is unaffected by a daylight-saving transition', () => {
		expect(daysBetween('2026-04-04', '2026-04-06')).toBe(2);
	});
});

describe('startOfWeek', () => {
	it('returns the Monday on or before the date', () => {
		// 2026-03-04 is a Wednesday.
		expect(startOfWeek('2026-03-04')).toBe('2026-03-02');
		// A Monday is its own start of week.
		expect(startOfWeek('2026-03-02')).toBe('2026-03-02');
		// Sunday belongs to the week that began six days earlier.
		expect(startOfWeek('2026-03-08')).toBe('2026-03-02');
	});
});

describe('describeDate', () => {
	it('names the days around the reference point', () => {
		expect(describeDate('2026-03-04', '2026-03-04')).toBe('Today');
		expect(describeDate('2026-03-05', '2026-03-04')).toBe('Tomorrow');
		expect(describeDate('2026-03-03', '2026-03-04')).toBe('Yesterday');
	});

	it('falls back to a short date further out', () => {
		expect(describeDate('2026-03-09', '2026-03-04')).toBe('Mon 9 Mar');
	});
});
