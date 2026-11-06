import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { expirePending, PENDING_HOLD_HOURS } from '../src/bookings.js';
import { agentFor, createRoom, dayFromNow, reset, setup, slot } from './helpers.js';

const { pool, app } = setup();

beforeEach(() => reset(pool));
afterAll(() => pool.end());

const ageBy = (id: number, hours: number) =>
  pool.query(`UPDATE bookings SET created_at = now() - make_interval(hours => $2) WHERE id = $1`, [id, hours]);

const statusOf = async (id: number): Promise<string> => {
  const stored = await pool.query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [id]);
  return stored.rows[0]!.status;
};

async function pendingBooking(roomId: number, days = 3): Promise<number> {
  const customer = await agentFor(app, 'customer', pool);
  const { body } = await customer.post('/api/bookings').send({ roomId, ...slot(days, 9, 10) }).expect(201);
  return body.data.id;
}

describe('expirePending', () => {
  it('expires a booking left undecided past the hold', async () => {
    const id = await pendingBooking(await createRoom(pool));
    await ageBy(id, PENDING_HOLD_HOURS);

    expect(await expirePending(pool)).toBe(1);

    expect(await statusOf(id)).toBe('expired');
    const stored = await pool.query('SELECT decided_by, decided_at FROM bookings WHERE id = $1', [id]);
    expect(stored.rows[0].decided_by).toBeNull();
    expect(stored.rows[0].decided_at).not.toBeNull();
  });

  it('expires a booking whose start time has arrived, even inside the hold', async () => {
    const id = await pendingBooking(await createRoom(pool));
    await pool.query(
      `UPDATE bookings SET during = tstzrange(now() - interval '1 minute', now() + interval '1 hour') WHERE id = $1`,
      [id],
    );

    await expirePending(pool);

    expect(await statusOf(id)).toBe('expired');
  });

  it('keeps a booking that is still inside the hold', async () => {
    const id = await pendingBooking(await createRoom(pool));
    await ageBy(id, PENDING_HOLD_HOURS - 1);

    expect(await expirePending(pool)).toBe(0);

    expect(await statusOf(id)).toBe('pending');
  });

  it('leaves decided bookings alone', async () => {
    const roomId = await createRoom(pool);
    const id = await pendingBooking(roomId);
    const admin = await agentFor(app, 'admin', pool);
    await admin.post(`/api/admin/bookings/${id}/decision`).send({ decision: 'confirm' }).expect(200);
    await ageBy(id, PENDING_HOLD_HOURS * 2);

    await expirePending(pool);

    expect(await statusOf(id)).toBe('confirmed');
  });

  it('frees the slot for another customer', async () => {
    const roomId = await createRoom(pool);
    const id = await pendingBooking(roomId);
    const other = await agentFor(app, 'customer', pool);
    await other.post('/api/bookings').send({ roomId, ...slot(3, 9, 10) }).expect(409);
    await ageBy(id, PENDING_HOLD_HOURS);

    await expirePending(pool);

    await other.post('/api/bookings').send({ roomId, ...slot(3, 9, 10) }).expect(201);
  });

  it('stops counting against the pending cap', async () => {
    const roomId = await createRoom(pool);
    const agent = await agentFor(app, 'customer', pool);
    for (let hour = 8; hour < 13; hour += 1) {
      await agent.post('/api/bookings').send({ roomId, ...slot(3, hour, hour + 1) }).expect(201);
    }
    await agent.post('/api/bookings').send({ roomId, ...slot(3, 15, 16) }).expect(429);
    await pool.query(`UPDATE bookings SET created_at = now() - make_interval(hours => $1)`, [PENDING_HOLD_HOURS]);

    await expirePending(pool);

    await agent.post('/api/bookings').send({ roomId, ...slot(3, 15, 16) }).expect(201);
  });
});

describe('an expired booking', () => {
  async function expiredBooking(): Promise<number> {
    const id = await pendingBooking(await createRoom(pool));
    await ageBy(id, PENDING_HOLD_HOURS);
    await expirePending(pool);
    return id;
  }

  it('cannot be decided any more', async () => {
    const id = await expiredBooking();
    const admin = await agentFor(app, 'admin', pool);

    const res = await admin.post(`/api/admin/bookings/${id}/decision`).send({ decision: 'confirm' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_DECIDED');
  });

  it('cannot be cancelled by its owner', async () => {
    const roomId = await createRoom(pool);
    const agent = await agentFor(app, 'customer', pool);
    const { body } = await agent.post('/api/bookings').send({ roomId, ...slot(3, 9, 10) }).expect(201);
    await ageBy(body.data.id, PENDING_HOLD_HOURS);
    await expirePending(pool);

    await agent.post(`/api/bookings/${body.data.id}/cancel`).expect(409);
  });

  it('can be listed by status and counts separately in the stats', async () => {
    const id = await expiredBooking();
    const admin = await agentFor(app, 'admin', pool);

    const list = await admin.get('/api/admin/bookings').query({ status: 'expired' }).expect(200);
    expect(list.body.data.items.map((item: { id: number }) => item.id)).toEqual([id]);

    const stats = await admin.get('/api/admin/stats').query({ from: dayFromNow(1), to: dayFromNow(5) }).expect(200);
    expect(stats.body.data.statusCounts).toEqual({ expired: 1 });
    expect(stats.body.data.revenueVnd).toBe(0);
  });
});
