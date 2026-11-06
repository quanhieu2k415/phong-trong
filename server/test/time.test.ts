import { describe, expect, it } from 'vitest';
import { atLocalHour, buildSlots, isValidDay, localDay, nextDay, rangeIssue } from '../src/time.js';

const now = new Date('2026-06-10T03:30:00Z'); // 10:30 in Vietnam
const on = (hour: number, day = '2026-06-12') => atLocalHour(day, hour);

describe('localDay', () => {
  it('uses the Vietnam date, not the UTC date', () => {
    expect(localDay(new Date('2026-06-10T17:30:00Z'))).toBe('2026-06-11');
  });
});

describe('isValidDay', () => {
  it.each(['2026-02-31', '2026-13-01', '10/06/2026', '2026-6-1', ''])('rejects %s', (day) => {
    expect(isValidDay(day)).toBe(false);
  });

  it('accepts a leap day', () => {
    expect(isValidDay('2028-02-29')).toBe(true);
  });
});

describe('nextDay', () => {
  it('crosses the end of a month', () => {
    expect(nextDay('2026-06-30')).toBe('2026-07-01');
  });
});

describe('rangeIssue', () => {
  it('accepts a whole-hour range inside opening hours', () => {
    expect(rangeIssue({ start: on(8), end: on(22) }, now)).toBe('TOO_LONG');
    expect(rangeIssue({ start: on(8), end: on(16) }, now)).toBeNull();
    expect(rangeIssue({ start: on(21), end: on(22) }, now)).toBeNull();
  });

  it.each([
    ['NOT_ON_THE_HOUR', new Date('2026-06-12T02:30:00Z'), on(11)],
    ['END_BEFORE_START', on(11), on(10)],
    ['END_BEFORE_START', on(11), on(11)],
    ['IN_THE_PAST', on(10, '2026-06-10'), on(12, '2026-06-10')],
    ['TOO_FAR_AHEAD', on(10, '2026-08-20'), on(11, '2026-08-20')],
    ['OUTSIDE_HOURS', on(7), on(9)],
    ['OUTSIDE_HOURS', on(21), on(23)],
    ['OUTSIDE_HOURS', on(21), on(9, '2026-06-13')],
  ])('reports %s', (issue, start, end) => {
    expect(rangeIssue({ start, end }, now)).toBe(issue);
  });
});

describe('buildSlots', () => {
  const day = '2026-06-10';

  it('produces one slot per opening hour', () => {
    const slots = buildSlots(day, [], now);
    expect(slots).toHaveLength(14);
    expect(slots[0]!.start).toBe(atLocalHour(day, 8).toISOString());
    expect(slots.at(-1)!.end).toBe(atLocalHour(day, 22).toISOString());
  });

  it('marks past, busy and free slots, with a range end staying exclusive', () => {
    const slots = buildSlots(day, [{ start: on(13, day), end: on(15, day) }], now);
    const stateAt = (hour: number) => slots[hour - 8]!.state;
    expect(stateAt(10)).toBe('past');
    expect(stateAt(11)).toBe('free');
    expect(stateAt(12)).toBe('free');
    expect(stateAt(13)).toBe('busy');
    expect(stateAt(14)).toBe('busy');
    expect(stateAt(15)).toBe('free');
  });
});
