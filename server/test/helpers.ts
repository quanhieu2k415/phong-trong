import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import type { Config } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { atLocalHour, localDay } from '../src/time.js';

export const PASSWORD = 'mat-khau-test';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    databaseUrl: process.env.TEST_DATABASE_URL!,
    jwtSecret: 'test-secret-test-secret-test-secret-123',
    isProduction: false,
    port: 0,
    bcryptRounds: 4,
    trustProxy: 0,
    loginLimit: 100_000,
    registerLimit: 100_000,
    ...overrides,
  };
}

export function setup(overrides: Partial<Config> = {}): { pool: Pool; app: Express } {
  const config = testConfig(overrides);
  const pool = createPool(config.databaseUrl);
  return { pool, app: createApp(pool, config) };
}

export const reset = (pool: Pool) =>
  pool.query('TRUNCATE bookings, rooms, users RESTART IDENTITY CASCADE');

export const dayFromNow = (days: number): string => localDay(new Date(Date.now() + days * 86_400_000));

export const slot = (days: number, startHour: number, endHour: number) => {
  const day = dayFromNow(days);
  return {
    start: atLocalHour(day, startHour).toISOString(),
    end: atLocalHour(day, endHour).toISOString(),
  };
};

let userCounter = 0;

export async function agentFor(app: Express, role: 'customer' | 'admin', pool: Pool) {
  userCounter += 1;
  const email = `${role}${userCounter}@test.vn`;
  await pool.query(
    'INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
    [email, bcrypt.hashSync(PASSWORD, 4), `Người dùng ${userCounter}`, role],
  );
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agent;
}

export async function createRoom(pool: Pool, price = 100_000, status = 'active'): Promise<number> {
  userCounter += 1;
  const result = await pool.query<{ id: number }>(
    `INSERT INTO rooms (name, capacity, hourly_price_vnd, status) VALUES ($1, 4, $2, $3) RETURNING id`,
    [`Phòng ${userCounter}`, price, status],
  );
  return result.rows[0]!.id;
}
