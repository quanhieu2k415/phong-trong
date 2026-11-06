import { Router } from 'express';
import { z } from 'zod';
import { BOOKING_COLUMNS, findBooking } from './bookings.js';
import type { Pool } from './db.js';
import { withTx } from './db.js';
import { AppError, parse, pgErrorCode } from './errors.js';
import { idSchema, ROOM_COLUMNS } from './rooms.js';
import { atLocalHour, isValidDay, nextDay } from './time.js';

const PAGE_SIZE = 50;
const MAX_STATS_DAYS = 366;
const UNIQUE_VIOLATION = '23505';

const listQuery = z.object({
  status: z.enum(['pending', 'confirmed', 'rejected', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});

const decisionSchema = z.object({ decision: z.enum(['confirm', 'reject']) });

const roomFields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000),
  capacity: z.number().int().min(1).max(500),
  hourlyPriceVnd: z.number().int().min(0).max(100_000_000),
  status: z.enum(['active', 'maintenance']),
};
const createRoomSchema = z.object({ ...roomFields, description: roomFields.description.default('') });
const updateRoomSchema = z
  .object(roomFields)
  .partial()
  .refine((fields) => Object.keys(fields).length > 0);

const statsQuery = z
  .object({ from: z.string().refine(isValidDay), to: z.string().refine(isValidDay) })
  .refine(({ from, to }) => {
    const days = (atLocalHour(to, 0).getTime() - atLocalHour(from, 0).getTime()) / 86_400_000;
    return days >= 0 && days < MAX_STATS_DAYS;
  });

function nameTaken(error: unknown): never {
  if (pgErrorCode(error) === UNIQUE_VIOLATION) {
    throw new AppError(409, 'ROOM_NAME_TAKEN', 'Tên phòng đã tồn tại.');
  }
  throw error;
}

async function decide(pool: Pool, id: number, decision: 'confirm' | 'reject', adminId: number): Promise<void> {
  await withTx(pool, async (tx) => {
    const found = await tx.query<{ status: string; roomStatus: string; hasStarted: boolean }>(
      `SELECT b.status, r.status AS "roomStatus", lower(b.during) <= now() AS "hasStarted" FROM bookings b
       JOIN rooms r ON r.id = b.room_id WHERE b.id = $1
       FOR UPDATE OF b FOR SHARE OF r`,
      [id],
    );
    const booking = found.rows[0];
    if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt.');
    if (booking.status !== 'pending') {
      throw new AppError(409, 'ALREADY_DECIDED', 'Đơn này đã được xử lý trước đó.');
    }
    if (decision === 'confirm' && booking.roomStatus !== 'active') {
      throw new AppError(409, 'ROOM_UNAVAILABLE', 'Phòng đang bảo trì, không thể duyệt đơn.');
    }
    if (decision === 'confirm' && booking.hasStarted) {
      throw new AppError(409, 'BOOKING_STARTED', 'Đơn này đã quá giờ, chỉ có thể từ chối.');
    }
    await tx.query(
      `UPDATE bookings SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1`,
      [id, decision === 'confirm' ? 'confirmed' : 'rejected', adminId],
    );
  });
}

export function createAdminRouter(pool: Pool): Router {
  const router = Router();

  router.get('/bookings', async (req, res) => {
    const { status, page } = parse(listQuery, req.query);
    const filter = status ?? null;
    const rows = await pool.query(
      `SELECT ${BOOKING_COLUMNS}, u.full_name AS "customerName", u.email AS "customerEmail"
       FROM bookings b JOIN rooms r ON r.id = b.room_id JOIN users u ON u.id = b.user_id
       WHERE $1::text IS NULL OR b.status = $1
       ORDER BY b.created_at DESC, b.id DESC LIMIT $2 OFFSET $3`,
      [filter, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );
    const count = await pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM bookings WHERE $1::text IS NULL OR status = $1`,
      [filter],
    );
    res.json({ data: { items: rows.rows, total: count.rows[0]!.total, page, pageSize: PAGE_SIZE } });
  });

  router.post('/bookings/:id/decision', async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const { decision } = parse(decisionSchema, req.body);
    await decide(pool, id, decision, req.user!.id);
    res.json({ data: await findBooking(pool, id) });
  });

  router.post('/rooms', async (req, res) => {
    const input = parse(createRoomSchema, req.body);
    const created = await pool
      .query(
        `INSERT INTO rooms (name, description, capacity, hourly_price_vnd, status)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${ROOM_COLUMNS}`,
        [input.name, input.description, input.capacity, input.hourlyPriceVnd, input.status],
      )
      .catch(nameTaken);
    res.status(201).json({ data: created.rows[0] });
  });

  router.patch('/rooms/:id', async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const input = parse(updateRoomSchema, req.body);
    const updated = await pool
      .query(
        `UPDATE rooms SET
           name = COALESCE($2, name),
           description = COALESCE($3, description),
           capacity = COALESCE($4, capacity),
           hourly_price_vnd = COALESCE($5, hourly_price_vnd),
           status = COALESCE($6, status)
         WHERE id = $1 RETURNING ${ROOM_COLUMNS}`,
        [id, input.name, input.description, input.capacity, input.hourlyPriceVnd, input.status],
      )
      .catch(nameTaken);
    if (!updated.rows[0]) throw new AppError(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');

    const upcoming = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM bookings
       WHERE room_id = $1 AND status IN ('pending', 'confirmed') AND lower(during) > now()`,
      [id],
    );
    res.json({ data: { room: updated.rows[0], upcomingBookings: upcoming.rows[0]!.count } });
  });

  router.get('/stats', async (req, res) => {
    const { from, to } = parse(statsQuery, req.query);
    const range = [atLocalHour(from, 0), atLocalHour(nextDay(to), 0)];

    const daily = await pool.query<{ day: string; revenueVnd: string; bookings: number }>(
      `WITH confirmed AS (
         SELECT (lower(during) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, total_vnd
         FROM bookings WHERE status = 'confirmed' AND lower(during) >= $3 AND lower(during) < $4
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
         COALESCE(sum(c.total_vnd), 0) AS "revenueVnd", count(c.day)::int AS bookings
       FROM generate_series($1::date, $2::date, interval '1 day') AS d(day)
       LEFT JOIN confirmed c ON c.day = d.day::date
       GROUP BY d.day ORDER BY d.day`,
      [from, to, ...range],
    );
    const rooms = await pool.query<{ roomId: number; roomName: string; revenueVnd: string; bookings: number }>(
      `SELECT r.id AS "roomId", r.name AS "roomName",
         COALESCE(sum(b.total_vnd), 0) AS "revenueVnd", count(b.id)::int AS bookings
       FROM rooms r LEFT JOIN bookings b ON b.room_id = r.id
         AND b.status = 'confirmed' AND lower(b.during) >= $1 AND lower(b.during) < $2
       GROUP BY r.id ORDER BY sum(b.total_vnd) DESC NULLS LAST, r.id`,
      range,
    );
    const statuses = await pool.query<{ status: string; count: number }>(
      `SELECT status, count(*)::int AS count FROM bookings
       WHERE lower(during) >= $1 AND lower(during) < $2 GROUP BY status`,
      range,
    );

    const dailyRows = daily.rows.map((row) => ({ ...row, revenueVnd: Number(row.revenueVnd) }));
    res.json({
      data: {
        from,
        to,
        revenueVnd: dailyRows.reduce((sum, row) => sum + row.revenueVnd, 0),
        daily: dailyRows,
        rooms: rooms.rows.map((row) => ({ ...row, revenueVnd: Number(row.revenueVnd) })),
        statusCounts: Object.fromEntries(statuses.rows.map((row) => [row.status, row.count])),
      },
    });
  });

  return router;
}
