import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

export type Pool = pg.Pool;
export type Tx = pg.PoolClient;

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export function createPool(connectionString: string): Pool {
  const pool = new pg.Pool({ connectionString, max: 20 });
  // Without a listener an error on an idle connection would crash the process.
  pool.on('error', (error) => console.error(error));
  return pool;
}

export async function withTx<T>(pool: Pool, work: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    const result = await work(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
}

export async function migrate(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const done = new Set(applied.rows.map((row) => row.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files.filter((name) => !done.has(name))) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await withTx(pool, async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
  }
}
