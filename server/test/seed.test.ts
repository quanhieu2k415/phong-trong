import { describe, expect, it } from 'vitest';
import { assertSafeSeed } from '../src/seed.js';

const example = { ADMIN_PASSWORD: 'admin-local-123', DEMO_PASSWORD: 'khach-local-123' };
const strong = { ADMIN_PASSWORD: 'mot-mat-khau-rieng', DEMO_PASSWORD: 'mot-mat-khau-khac' };

describe('assertSafeSeed', () => {
  it('refuses the example passwords on a remote database', () => {
    expect(() => assertSafeSeed('postgres://u:p@db.example.com/app', example)).toThrow(/example passwords/);
  });

  it('accepts them on a local database', () => {
    expect(() => assertSafeSeed('postgres://u:p@localhost:5432/app', example)).not.toThrow();
    expect(() => assertSafeSeed('postgres://u:p@127.0.0.1:5432/app', example)).not.toThrow();
  });

  it('accepts other passwords on a remote database', () => {
    expect(() => assertSafeSeed('postgres://u:p@db.example.com/app', strong)).not.toThrow();
  });
});
