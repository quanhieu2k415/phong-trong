import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { createPool, migrate } from '../src/db.js';

const PORT = 54391;

export default async function setup(): Promise<() => Promise<void>> {
  const databaseDir = mkdtempSync(path.join(tmpdir(), 'phong-trong-test-'));
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'test',
    port: PORT,
    persistent: false,
    onLog: () => {},
  });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('test');

  process.env.TEST_DATABASE_URL = `postgres://postgres:test@localhost:${PORT}/test`;
  const pool = createPool(process.env.TEST_DATABASE_URL);
  await migrate(pool);
  await pool.end();

  return async () => {
    await postgres.stop();
    rmSync(databaseDir, { recursive: true, force: true });
  };
}
