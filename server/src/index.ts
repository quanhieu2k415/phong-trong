import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

const config = loadConfig(process.env);
const pool = createPool(config.databaseUrl);

const server = createApp(pool, config).listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

function shutdown(): void {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
