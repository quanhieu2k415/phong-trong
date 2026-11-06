import { createPool, migrate } from '../src/db.js';
import { seed } from '../src/seed.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required.');

const pool = createPool(url);
await migrate(pool);
await seed(pool, process.env);
await pool.end();
console.log('Database is ready.');
