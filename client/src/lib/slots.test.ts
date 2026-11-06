import { describe, expect, it } from 'vitest';
import { hourLabels, parseSelection, pickSlot, selectionIsFree, selectionRange, type Selection } from './slots';
import type { Slot } from './types';

const DAY = '2026-06-12';
const iso = (hour: number) => new Date(Date.UTC(2026, 5, 12, hour - 7)).toISOString();
const slots = (busy: number[] = [], past: number[] = []): Slot[] =>
  Array.from({ length: 14 }, (_, index) => {
    const hour = 8 + index;
    const state = busy.includes(hour) ? 'busy' : past.includes(hour) ? 'past' : 'free';
    return { start: iso(hour), end: iso(hour + 1), state };
  });
const range = (startHour: number, endHour: number): NonNullable<Selection> => ({ startHour, endHour });

describe('pickSlot', () => {
  it('starts a one-hour selection on the first tap', () => {
    expect(pickSlot(null, 9, slots())).toEqual(range(9, 10));
  });

  it('clears when the only selected hour is tapped again', () => {
    expect(pickSlot(range(9, 10), 9, slots())).toBeNull();
  });

  it('extends forward and backward through free hours', () => {
    expect(pickSlot(range(9, 10), 12, slots())).toEqual(range(9, 13));
    expect(pickSlot(range(12, 13), 9, slots())).toEqual(range(9, 13));
  });

  it('starts over instead of extending across a busy hour', () => {
    expect(pickSlot(range(9, 10), 12, slots([11]))).toEqual(range(12, 13));
  });

  it('starts over instead of going past the 8 hour limit', () => {
    expect(pickSlot(range(8, 9), 16, slots())).toEqual(range(16, 17));
    expect(pickSlot(range(8, 9), 15, slots())).toEqual(range(8, 16));
  });

  it('collapses to one hour when tapping inside a longer range', () => {
    expect(pickSlot(range(9, 13), 11, slots())).toEqual(range(11, 12));
  });

  it('ignores a slot that is not free', () => {
    expect(pickSlot(range(9, 10), 11, slots([11]))).toEqual(range(9, 10));
    expect(pickSlot(null, 8, slots([], [8]))).toBeNull();
  });
});

describe('selectionIsFree', () => {
  it('turns false once any hour of the selection is taken', () => {
    expect(selectionIsFree(range(9, 12), slots())).toBe(true);
    expect(selectionIsFree(range(9, 12), slots([10]))).toBe(false);
  });

  it('treats an hour outside the day as not free', () => {
    expect(selectionIsFree(range(21, 23), slots())).toBe(false);
  });
});

describe('selectionRange', () => {
  it('builds the instants the API expects, in Vietnam time', () => {
    expect(selectionRange(DAY, range(9, 11))).toEqual({
      start: '2026-06-12T02:00:00.000Z',
      end: '2026-06-12T04:00:00.000Z',
    });
  });
});

describe('hourLabels', () => {
  it('labels a slot by its Vietnam start hour', () => {
    expect(hourLabels(slots()).slice(0, 2)).toEqual([8, 9]);
  });
});

describe('parseSelection', () => {
  it('reads hours from the URL', () => {
    expect(parseSelection('9', '11')).toEqual(range(9, 11));
  });

  it.each([
    [null, null],
    ['9', null],
    ['x', '11'],
    ['11', '9'],
    ['9.5', '11'],
  ])('ignores %s to %s', (start, end) => {
    expect(parseSelection(start, end)).toBeNull();
  });
});
