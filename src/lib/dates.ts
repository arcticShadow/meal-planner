/**
 * Date helpers for the planner.
 *
 * Every date in this app is a calendar day the cook thinks in ("Monday the
 * 2nd"), never an instant. Routing those through `Date.toISOString()` is a
 * trap: it converts local time to UTC, so local midnight in any timezone
 * ahead of UTC lands on the previous day and the whole plan slips. These
 * helpers stay in local time throughout.
 */

/** Format a Date as a local YYYY-MM-DD, without the UTC shift. */
export function toISODate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD into a Date at local midnight. */
export function fromISODate(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function today(): string {
	return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
	const d = fromISODate(iso);
	d.setDate(d.getDate() + days);
	return toISODate(d);
}

/** Difference in whole days, b - a. */
export function daysBetween(a: string, b: string): number {
	const ms = fromISODate(b).getTime() - fromISODate(a).getTime();
	return Math.round(ms / 86_400_000);
}

/** The Monday on or before the given date. */
export function startOfWeek(iso: string): string {
	const d = fromISODate(iso);
	// getDay() is 0 for Sunday; shift so Monday is the first day.
	const offset = (d.getDay() + 6) % 7;
	return addDays(iso, -offset);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

export function weekdayShort(iso: string): string {
	return WEEKDAY[fromISODate(iso).getDay()];
}

export function dayOfMonth(iso: string): number {
	return fromISODate(iso).getDate();
}

export function monthShort(iso: string): string {
	return MONTH[fromISODate(iso).getMonth()];
}

/** "Today", "Tomorrow", "Yesterday", else "Mon 2 Mar". */
export function describeDate(iso: string, from = today()): string {
	const delta = daysBetween(from, iso);
	if (delta === 0) return 'Today';
	if (delta === 1) return 'Tomorrow';
	if (delta === -1) return 'Yesterday';
	return `${weekdayShort(iso)} ${dayOfMonth(iso)} ${monthShort(iso)}`;
}
