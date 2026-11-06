import { describe, expect, it, vi } from 'vitest';
import { createPool } from '../src/db.js';

describe('createPool', () => {
  it('survives an error on an idle connection', async () => {
    const pool = createPool('postgres://localhost:1/none');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => pool.emit('error', new Error('terminated'))).not.toThrow();

    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
    await pool.end();
  });
});
