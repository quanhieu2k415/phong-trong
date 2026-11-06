import { describe, expect, it } from 'vitest';
import { addDays, compactVnd, dayLabel, formatVnd, localDay, shortDay, timeRange } from './format';

describe('formatVnd', () => {
  it('groups thousands the Vietnamese way', () => {
    expect(formatVnd(1_250_000).replace(/\s/g, ' ')).toBe('1.250.000 ₫');
  });
});

describe('compactVnd', () => {
  it.each([
    [0, '0'],
    [500_000, '500K'],
    [1_000_000, '1Tr'],
    [1_250_000, '1,25Tr'],
  ])('renders %d as %s', (value, expected) => {
    expect(compactVnd(value)).toBe(expected);
  });
});

describe('localDay', () => {
  it('uses the Vietnam date even when UTC is still on the previous day', () => {
    expect(localDay(new Date('2026-06-10T17:30:00Z'))).toBe('2026-06-11');
  });
});

describe('addDays', () => {
  it('crosses a month without any device time zone effect', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('labels', () => {
  it('shows the day in Vietnamese', () => {
    expect(dayLabel('2026-06-12')).toBe('Thứ Sáu, 12/06');
    expect(shortDay('2026-06-12')).toBe('12/06');
  });

  it('shows a time range in Vietnam time', () => {
    expect(timeRange('2026-06-12T02:00:00Z', '2026-06-12T04:00:00Z')).toBe('09:00 – 11:00');
  });
});
