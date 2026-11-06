import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { createPool, migrate } from '../src/db.js';
import { seed } from '../src/seed.js';

const url = new URL(process.env.DATABASE_URL ?? '');
const databaseDir = fileURLToPath(new URL('../.pgdata', import.meta.url));
const database = url.pathname.slice(1);

const postgres = new EmbeddedPostgres({
  databaseDir,
  user: url.username,
  password: url.password,
  port: Number(url.port),
  persistent: true,
  onLog: () => {},
});

const isNew = !existsSync(path.join(databaseDir, 'PG_VERSION'));
if (isNew) await postgres.initialise();
await postgres.start();
if (isNew) await postgres.createDatabase(database);

const pool = createPool(url.href);
await migrate(pool);
await seed(pool, process.env);
await pool.end();
console.log(`Postgres ready on port ${url.port}`);

async function stop(): Promise<void> {
  await postgres.stop();
  process.exit(0);
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
