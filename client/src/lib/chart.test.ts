import { describe, expect, it } from 'vitest';
import { axisTicks, extremeIndex } from './chart';

describe('axisTicks', () => {
  it('starts at zero and covers the largest value on round numbers', () => {
    expect(axisTicks(1_250_000)).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    expect(axisTicks(900_000)).toEqual([0, 500_000, 1_000_000]);
    expect(axisTicks(3_000_000)).toEqual([0, 1_000_000, 2_000_000, 3_000_000]);
  });

  it('still draws an axis when there is no revenue', () => {
    expect(axisTicks(0)).toEqual([0, 500_000, 1_000_000]);
  });
});

describe('extremeIndex', () => {
  it('finds the highest day', () => {
    expect(extremeIndex([1, 5, 2])).toBe(1);
  });

  it('keeps the first of equal highs and labels nothing when all are zero', () => {
    expect(extremeIndex([5, 5])).toBe(0);
    expect(extremeIndex([0, 0])).toBe(-1);
  });
});
