import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { createAdminRouter } from './admin.js';
import { createAuth } from './auth.js';
import { createBookingsRouter } from './bookings.js';
import type { Config } from './config.js';
import type { Pool } from './db.js';
import { AppError, errorHandler } from './errors.js';
import { createRoomsRouter } from './rooms.js';

const CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

export function createApp(pool: Pool, config: Config): Express {
  const app = express();
  const auth = createAuth(pool, config);

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ data: { status: 'ok' } });
  });

  app.use('/api', auth.attachUser);
  app.use('/api/auth', auth.router);
  app.use('/api/rooms', createRoomsRouter(pool));
  app.use('/api/bookings', auth.requireUser, createBookingsRouter(pool));
  app.use('/api/admin', auth.requireAdmin, createAdminRouter(pool));
  app.use('/api', () => {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy đường dẫn.');
  });

  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
