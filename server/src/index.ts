import { createApp } from './app.js';
import { expirePending } from './bookings.js';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';

const EXPIRY_SWEEP_MS = 60_000;

const config = loadConfig(process.env);
const pool = createPool(config.databaseUrl);

// In development dev-db migrates once Postgres is up, which can be after this process starts.
if (config.isProduction) await migrate(pool);

const server = createApp(pool, config).listen(config.port, (error) => {
  // Express hands listen failures to this callback, and the sweep timer would keep a dead server alive.
  if (error) throw error;
  console.log(`API listening on http://localhost:${config.port}`);
});

function sweepExpired(): void {
  expirePending(pool).catch((error: unknown) => console.error('Expiry sweep failed', error));
}

sweepExpired();
const sweeper = setInterval(sweepExpired, EXPIRY_SWEEP_MS);

function shutdown(): void {
  clearInterval(sweeper);
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
