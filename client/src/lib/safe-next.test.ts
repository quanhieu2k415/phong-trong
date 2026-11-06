import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps a local path with its query', () => {
    expect(safeNext('/phong/2?date=2026-06-12&start=9&end=11')).toBe('/phong/2?date=2026-06-12&start=9&end=11');
  });

  it.each([null, '', 'https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/\t/evil.test', '//'])(
    'falls back to home for %s',
    (value) => {
      expect(safeNext(value)).toBe('/');
    },
  );
});
