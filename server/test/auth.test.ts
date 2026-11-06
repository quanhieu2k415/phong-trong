import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { reset, setup } from './helpers.js';

const { pool, app } = setup();
const user = { email: 'Khach@Test.vn', password: 'mot-mat-khau-dai', fullName: 'Nguyễn Khách' };

beforeEach(() => reset(pool));
afterAll(() => pool.end());

describe('auth', () => {
  it('registers, keeps a session and logs out', async () => {
    const agent = request.agent(app);

    const created = await agent.post('/api/auth/register').send(user).expect(201);
    expect(created.body.data).toMatchObject({ email: 'khach@test.vn', role: 'customer' });
    expect(created.body.data).not.toHaveProperty('passwordHash');
    const cookie = created.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.data.email).toBe('khach@test.vn');

    await agent.post('/api/auth/logout').expect(204);
    const after = await agent.get('/api/auth/me').expect(200);
    expect(after.body.data).toBeNull();
  });

  it('ignores a role sent during registration', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...user, role: 'admin' }).expect(201);
    expect(res.body.data.role).toBe('customer');
  });

  it('refuses a duplicate email regardless of case', async () => {
    await request(app).post('/api/auth/register').send(user).expect(201);
    const res = await request(app).post('/api/auth/register').send({ ...user, email: 'KHACH@test.vn' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await request(app).post('/api/auth/register').send(user).expect(201);
    const wrong = await request(app).post('/api/auth/login').send({ email: user.email, password: 'sai-mat-khau' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ai@test.vn', password: 'sai-mat-khau' });
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('treats a forged session cookie as anonymous', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'session=not.a.token').expect(200);
    expect(res.body.data).toBeNull();
  });

  it('blocks further attempts after too many failed logins', async () => {
    const limited = setup({ loginLimit: 3 });
    const attempt = () =>
      request(limited.app).post('/api/auth/login').send({ email: 'ai@test.vn', password: 'sai-mat-khau' });
    await attempt().expect(401);
    await attempt().expect(401);
    await attempt().expect(401);
    await attempt().expect(429);
    await limited.pool.end();
  });
});

describe('registration limit', () => {
  it('counts successful sign-ups so one address cannot mint accounts', async () => {
    const limited = setup({ registerLimit: 2 });
    const signUp = (index: number) =>
      request(limited.app).post('/api/auth/register').send({ ...user, email: `khach${index}@test.vn` });
    await signUp(1).expect(201);
    await signUp(2).expect(201);
    await signUp(3).expect(429);
    await limited.pool.end();
  });
});

describe('loadConfig', () => {
  const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(32) };

  it('fails fast on a weak secret', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('refuses the example secret in production', () => {
    const env = { ...base, NODE_ENV: 'production', JWT_SECRET: `change-me-${'a'.repeat(30)}` };
    expect(() => loadConfig(env)).toThrow(/example value/);
  });

  it('treats a missing NODE_ENV as production', () => {
    const env = { ...base, JWT_SECRET: `change-me-${'a'.repeat(30)}` };
    expect(() => loadConfig(env)).toThrow(/example value/);
  });

  it('requires an explicit proxy setting in production', () => {
    expect(() => loadConfig(base)).toThrow(/TRUST_PROXY/);
    expect(loadConfig({ ...base, TRUST_PROXY: '0' })).toMatchObject({ isProduction: true, trustProxy: 0 });
  });

  it('allows the example secret and an unset proxy in development', () => {
    const env = { ...base, NODE_ENV: 'development', JWT_SECRET: `change-me-${'a'.repeat(30)}` };
    expect(loadConfig(env)).toMatchObject({ isProduction: false, trustProxy: 0 });
  });
});
