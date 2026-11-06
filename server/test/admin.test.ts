import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { localDay } from '../src/time.js';
import { agentFor, createRoom, dayFromNow, reset, setup, slot } from './helpers.js';

const { pool, app } = setup();

beforeEach(() => reset(pool));
afterAll(() => pool.end());

async function pendingBooking(roomId: number, days = 3, startHour = 9, endHour = 10): Promise<number> {
  const customer = await agentFor(app, 'customer', pool);
  const { body } = await customer.post('/api/bookings').send({ roomId, ...slot(days, startHour, endHour) }).expect(201);
  return body.data.id;
}

describe('access control', () => {
  it.each(['/api/admin/bookings', '/api/admin/stats?from=2026-01-01&to=2026-01-02'])('protects %s', async (url) => {
    await request(app).get(url).expect(401);
    const customer = await agentFor(app, 'customer', pool);
    await customer.get(url).expect(403);
  });
});

describe('booking decisions', () => {
  it('confirms a pending booking and records who decided', async () => {
    const roomId = await createRoom(pool);
    const id = await pendingBooking(roomId);
    const admin = await agentFor(app, 'admin', pool);

    const res = await admin.post(`/api/admin/bookings/${id}/decision`).send({ decision: 'confirm' }).expect(200);

    expect(res.body.data.status).toBe('confirmed');
    const stored = await pool.query('SELECT decided_by, decided_at FROM bookings WHERE id = $1', [id]);
    expect(stored.rows[0].decided_by).not.toBeNull();
    expect(stored.rows[0].decided_at).not.toBeNull();
  });

  it('lets only the first of two concurrent decisions apply', async () => {
    const roomId = await createRoom(pool);
    const id = await pendingBooking(roomId);
    const admin = await agentFor(app, 'admin', pool);

    const results = await Promise.all([
      admin.post(`/api/admin/bookings/${id}/decision`).send({ decision: 'confirm' }),
      admin.post(`/api/admin/bookings/${id}/decision`).send({ decision: 'reject' }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
  });

  it('frees the slot when rejected', async () => {
    const roomId = await createRoom(pool);
    const id = await pendingBooking(roomId);
    const admin = await agentFor(app, 'admin', pool);
    await admin.post(`/api/admin/bookings/${id}/decision`).send({ decision: 'reject' }).expect(200);
    await pendingBooking(roomId);
  });

  it('will not confirm a booking in a room under maintenance', async () => {
    const roomId = await createRoom(pool);
    const id = await pendingBooking(roomId);
    const admin = await agentFor(app, 'admin', pool);
    await admin.patch(`/api/admin/rooms/${roomId}`).send({ status: 'maintenance' }).expect(200);

    const res = await admin.post(`/api/admin/bookings/${id}/decision`).send({ decision: 'confirm' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROOM_UNAVAILABLE');
  });

  it('will not confirm a booking whose time has passed, but can still reject it', async () => {
    const roomId = await createRoom(pool);
    const id = await pendingBooking(roomId);
    const admin = await agentFor(app, 'admin', pool);
    await pool.query(
      `UPDATE bookings SET during = tstzrange(lower(during) - interval '30 days', upper(during) - interval '30 days') WHERE id = $1`,
      [id],
    );

    const res = await admin.post(`/api/admin/bookings/${id}/decision`).send({ decision: 'confirm' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_STARTED');
    await admin.post(`/api/admin/bookings/${id}/decision`).send({ decision: 'reject' }).expect(200);
  });

  it('answers 404 for an unknown booking', async () => {
    const admin = await agentFor(app, 'admin', pool);
    await admin.post('/api/admin/bookings/999/decision').send({ decision: 'confirm' }).expect(404);
  });
});

describe('GET /api/admin/bookings', () => {
  it('filters by status and shows the customer', async () => {
    const roomId = await createRoom(pool);
    const kept = await pendingBooking(roomId, 3, 9, 10);
    const confirmed = await pendingBooking(roomId, 3, 11, 12);
    const admin = await agentFor(app, 'admin', pool);
    await admin.post(`/api/admin/bookings/${confirmed}/decision`).send({ decision: 'confirm' }).expect(200);

    const res = await admin.get('/api/admin/bookings').query({ status: 'pending' }).expect(200);

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].id).toBe(kept);
    expect(res.body.data.items[0].customerEmail).toMatch(/@test\.vn$/);
    expect(res.body.data.items[0]).not.toHaveProperty('totalCount');
  });

  it('keeps the real total on a page past the end', async () => {
    const roomId = await createRoom(pool);
    await pendingBooking(roomId);
    const admin = await agentFor(app, 'admin', pool);

    const res = await admin.get('/api/admin/bookings').query({ status: 'pending', page: 2 }).expect(200);

    expect(res.body.data).toMatchObject({ items: [], total: 1, page: 2 });
  });
});

describe('rooms', () => {
  it('creates a room and refuses a duplicate name', async () => {
    const admin = await agentFor(app, 'admin', pool);
    const room = { name: 'Phòng Lan', capacity: 8, hourlyPriceVnd: 200_000, status: 'active' };
    const created = await admin.post('/api/admin/rooms').send(room).expect(201);
    expect(created.body.data).toMatchObject({ name: 'Phòng Lan', description: '' });
    await admin.post('/api/admin/rooms').send(room).expect(409);
  });

  it('updates only the sent fields and warns about upcoming bookings', async () => {
    const roomId = await createRoom(pool, 120_000);
    await pendingBooking(roomId);
    const admin = await agentFor(app, 'admin', pool);

    const res = await admin.patch(`/api/admin/rooms/${roomId}`).send({ status: 'maintenance' }).expect(200);

    expect(res.body.data.room).toMatchObject({ status: 'maintenance', hourlyPriceVnd: 120_000 });
    expect(res.body.data.upcomingBookings).toBe(1);
  });

  it('rejects an empty update and a negative price', async () => {
    const roomId = await createRoom(pool);
    const admin = await agentFor(app, 'admin', pool);
    await admin.patch(`/api/admin/rooms/${roomId}`).send({}).expect(400);
    await admin.patch(`/api/admin/rooms/${roomId}`).send({ hourlyPriceVnd: -1 }).expect(400);
  });
});

describe('GET /api/admin/stats', () => {
  it('counts confirmed bookings only and fills empty days with zero', async () => {
    const roomA = await createRoom(pool, 100_000);
    const roomB = await createRoom(pool, 200_000);
    const admin = await agentFor(app, 'admin', pool);
    const confirm = (id: number) =>
      admin.post(`/api/admin/bookings/${id}/decision`).send({ decision: 'confirm' }).expect(200);

    await confirm(await pendingBooking(roomA, 2, 9, 11)); // 200k
    await confirm(await pendingBooking(roomB, 4, 9, 10)); // 200k
    await pendingBooking(roomB, 4, 12, 13); // still pending, not revenue

    const res = await admin.get('/api/admin/stats').query({ from: dayFromNow(1), to: dayFromNow(5) }).expect(200);
    const { data } = res.body;

    expect(data.revenueVnd).toBe(400_000);
    expect(data.daily).toHaveLength(5);
    expect(data.daily[1]).toEqual({ day: dayFromNow(2), revenueVnd: 200_000, bookings: 1 });
    expect(data.daily[0].revenueVnd).toBe(0);
    expect(data.statusCounts).toEqual({ confirmed: 2, pending: 1 });
    expect(data.rooms).toHaveLength(2);
  });

  it('assigns an early-morning booking to its Vietnam date', async () => {
    const roomId = await createRoom(pool, 100_000);
    const id = await pendingBooking(roomId, 2, 8, 9); // 08:00 +07 is 01:00 UTC the same day
    await pool.query(
      `UPDATE bookings SET status = 'confirmed',
         during = tstzrange(lower(during) - interval '8 hours', upper(during) - interval '8 hours') WHERE id = $1`,
      [id],
    ); // now 00:00 +07, which is the previous UTC date
    const admin = await agentFor(app, 'admin', pool);

    const res = await admin.get('/api/admin/stats').query({ from: dayFromNow(2), to: dayFromNow(2) }).expect(200);

    expect(res.body.data.daily).toEqual([{ day: dayFromNow(2), revenueVnd: 100_000, bookings: 1 }]);
  });

  it('rejects a reversed or oversized range', async () => {
    const admin = await agentFor(app, 'admin', pool);
    await admin.get('/api/admin/stats').query({ from: dayFromNow(5), to: dayFromNow(1) }).expect(400);
    await admin.get('/api/admin/stats').query({ from: '2020-01-01', to: localDay(new Date()) }).expect(400);
  });
});
