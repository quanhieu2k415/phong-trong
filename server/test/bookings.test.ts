import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_PENDING_PER_USER } from '../src/bookings.js';
import { agentFor, createRoom, dayFromNow, reset, setup, slot } from './helpers.js';

const { pool, app } = setup();

beforeEach(() => reset(pool));
afterAll(() => pool.end());

describe('POST /api/bookings', () => {
  it('requires a session', async () => {
    const roomId = await createRoom(pool);
    await request(app).post('/api/bookings').send({ roomId, ...slot(3, 9, 10) }).expect(401);
  });

  it('creates a pending booking and snapshots the price', async () => {
    const roomId = await createRoom(pool, 150_000);
    const agent = await agentFor(app, 'customer', pool);

    const res = await agent.post('/api/bookings').send({ roomId, ...slot(3, 9, 12), note: ' Họp nhóm ' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ roomId, status: 'pending', totalVnd: 450_000, note: 'Họp nhóm' });

    await pool.query('UPDATE rooms SET hourly_price_vnd = 999 WHERE id = $1', [roomId]);
    const mine = await agent.get('/api/bookings/mine').expect(200);
    expect(mine.body.data[0].totalVnd).toBe(450_000);
  });

  it('rejects an overlapping range but allows back-to-back bookings', async () => {
    const roomId = await createRoom(pool);
    const first = await agentFor(app, 'customer', pool);
    const second = await agentFor(app, 'customer', pool);
    await first.post('/api/bookings').send({ roomId, ...slot(3, 10, 12) }).expect(201);

    const overlap = await second.post('/api/bookings').send({ roomId, ...slot(3, 11, 13) });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('SLOT_TAKEN');

    await second.post('/api/bookings').send({ roomId, ...slot(3, 12, 13) }).expect(201);
    await second.post('/api/bookings').send({ roomId, ...slot(3, 9, 10) }).expect(201);
  });

  it('lets exactly one of many concurrent requests win a slot', async () => {
    const roomId = await createRoom(pool);
    const agents = await Promise.all(Array.from({ length: 20 }, () => agentFor(app, 'customer', pool)));

    const results = await Promise.all(
      agents.map((agent) => agent.post('/api/bookings').send({ roomId, ...slot(4, 14, 16) })),
    );

    const statuses = results.map((res) => res.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(19);
    const stored = await pool.query('SELECT 1 FROM bookings WHERE room_id = $1', [roomId]);
    expect(stored.rowCount).toBe(1);
  });

  it('frees the slot once a booking is rejected or cancelled', async () => {
    const roomId = await createRoom(pool);
    const first = await agentFor(app, 'customer', pool);
    const second = await agentFor(app, 'customer', pool);
    const created = await first.post('/api/bookings').send({ roomId, ...slot(3, 9, 10) }).expect(201);

    await first.post(`/api/bookings/${created.body.data.id}/cancel`).expect(200);

    await second.post('/api/bookings').send({ roomId, ...slot(3, 9, 10) }).expect(201);
  });

  it('refuses a room under maintenance', async () => {
    const roomId = await createRoom(pool, 100_000, 'maintenance');
    const agent = await agentFor(app, 'customer', pool);
    const res = await agent.post('/api/bookings').send({ roomId, ...slot(3, 9, 10) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROOM_UNAVAILABLE');
  });

  it('returns a specific error for rule violations', async () => {
    const roomId = await createRoom(pool);
    const agent = await agentFor(app, 'customer', pool);
    const res = await agent.post('/api/bookings').send({ roomId, ...slot(3, 6, 9) });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUTSIDE_HOURS');
  });

  it('rejects malformed input and an unknown room', async () => {
    const agent = await agentFor(app, 'customer', pool);
    await agent.post('/api/bookings').send({ roomId: 'x', start: 'hôm nay' }).expect(400);
    await agent.post('/api/bookings').send({ roomId: 999_999, ...slot(3, 9, 10) }).expect(404);
  });

  it('caps how many pending bookings one account can hold', async () => {
    const roomId = await createRoom(pool);
    const agent = await agentFor(app, 'customer', pool);
    for (let hour = 8; hour < 8 + MAX_PENDING_PER_USER; hour += 1) {
      await agent.post('/api/bookings').send({ roomId, ...slot(3, hour, hour + 1) }).expect(201);
    }
    const res = await agent.post('/api/bookings').send({ roomId, ...slot(3, 15, 16) });
    expect(res.status).toBe(429);
  });

  it('stops counting a pending booking once its time has passed', async () => {
    const roomId = await createRoom(pool);
    const agent = await agentFor(app, 'customer', pool);
    for (let hour = 8; hour < 8 + MAX_PENDING_PER_USER; hour += 1) {
      await agent.post('/api/bookings').send({ roomId, ...slot(3, hour, hour + 1) }).expect(201);
    }
    await pool.query(`UPDATE bookings SET during = tstzrange(lower(during) - interval '30 days', upper(during) - interval '30 days')`);

    await agent.post('/api/bookings').send({ roomId, ...slot(3, 15, 16) }).expect(201);
  });

  it('holds the pending cap against parallel requests', async () => {
    const roomId = await createRoom(pool);
    const agent = await agentFor(app, 'customer', pool);
    const hours = Array.from({ length: 12 }, (_, index) => 8 + index);

    const results = await Promise.all(
      hours.map((hour) => agent.post('/api/bookings').send({ roomId, ...slot(3, hour, hour + 1) })),
    );

    const created = results.filter((res) => res.status === 201);
    expect(created).toHaveLength(MAX_PENDING_PER_USER);
  });
});

describe('POST /api/bookings/:id/cancel', () => {
  it('hides another customer booking behind a 404', async () => {
    const roomId = await createRoom(pool);
    const owner = await agentFor(app, 'customer', pool);
    const stranger = await agentFor(app, 'customer', pool);
    const { body } = await owner.post('/api/bookings').send({ roomId, ...slot(3, 9, 10) });

    await stranger.post(`/api/bookings/${body.data.id}/cancel`).expect(404);

    const stored = await pool.query('SELECT status FROM bookings WHERE id = $1', [body.data.id]);
    expect(stored.rows[0].status).toBe('pending');
  });

  it('refuses a second cancellation and a booking that already started', async () => {
    const roomId = await createRoom(pool);
    const agent = await agentFor(app, 'customer', pool);
    const { body } = await agent.post('/api/bookings').send({ roomId, ...slot(3, 9, 10) });
    await agent.post(`/api/bookings/${body.data.id}/cancel`).expect(200);
    await agent.post(`/api/bookings/${body.data.id}/cancel`).expect(409);

    const started = await agent.post('/api/bookings').send({ roomId, ...slot(3, 11, 12) });
    await pool.query(
      `UPDATE bookings SET during = tstzrange(now() - interval '1 hour', now() + interval '1 hour') WHERE id = $1`,
      [started.body.data.id],
    );
    await agent.post(`/api/bookings/${started.body.data.id}/cancel`).expect(409);
  });
});

describe('GET /api/rooms/:id/availability', () => {
  it('reports booked slots to anonymous visitors without customer data', async () => {
    const roomId = await createRoom(pool);
    const agent = await agentFor(app, 'customer', pool);
    await agent.post('/api/bookings').send({ roomId, ...slot(3, 9, 11) }).expect(201);

    const res = await request(app).get(`/api/rooms/${roomId}/availability`).query({ date: dayFromNow(3) });

    expect(res.status).toBe(200);
    const { slots } = res.body.data;
    expect(slots.map((item: { state: string }) => item.state).slice(0, 4)).toEqual(['free', 'busy', 'busy', 'free']);
    expect(JSON.stringify(res.body)).not.toMatch(/email|userId|note/);
  });

  it('rejects an impossible date', async () => {
    const roomId = await createRoom(pool);
    await request(app).get(`/api/rooms/${roomId}/availability`).query({ date: '2026-02-31' }).expect(400);
  });
});
