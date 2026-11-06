import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from './db.js';
import { withTx } from './db.js';
import { AppError, parse, pgErrorCode } from './errors.js';
import { idSchema } from './rooms.js';
import { hoursBetween, rangeIssue, type RangeIssue } from './time.js';

const EXCLUSION_VIOLATION = '23P01';
const DEADLOCK_DETECTED = '40P01';
const MAX_ATTEMPTS = 4;
export const MAX_PENDING_PER_USER = 5;

export const BOOKING_COLUMNS = `b.id, b.room_id AS "roomId", r.name AS "roomName",
  lower(b.during) AS start, upper(b.during) AS "end", b.status,
  b.total_vnd AS "totalVnd", b.note, b.created_at AS "createdAt"`;

const RANGE_MESSAGES: Record<RangeIssue, string> = {
  NOT_ON_THE_HOUR: 'Lịch đặt phải bắt đầu và kết thúc vào đầu giờ.',
  END_BEFORE_START: 'Giờ kết thúc phải sau giờ bắt đầu.',
  IN_THE_PAST: 'Không thể đặt khung giờ đã qua.',
  TOO_FAR_AHEAD: 'Chỉ nhận đặt trước tối đa 60 ngày.',
  OUTSIDE_HOURS: 'Phòng chỉ mở từ 08:00 đến 22:00 trong cùng một ngày.',
  TOO_LONG: 'Mỗi lần đặt tối đa 8 giờ.',
};

const createSchema = z.object({
  roomId: idSchema,
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  note: z.string().trim().max(500).default(''),
});

interface NewBooking {
  roomId: number;
  userId: number;
  start: Date;
  end: Date;
  note: string;
}

async function insertBooking(pool: Pool, booking: NewBooking): Promise<number> {
  return withTx(pool, async (tx) => {
    // The shared lock makes a concurrent switch to maintenance wait for this insert.
    const room = await tx.query<{ status: string; price: number }>(
      'SELECT status, hourly_price_vnd AS price FROM rooms WHERE id = $1 FOR SHARE',
      [booking.roomId],
    );
    if (!room.rows[0]) throw new AppError(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
    if (room.rows[0].status !== 'active') {
      throw new AppError(409, 'ROOM_UNAVAILABLE', 'Phòng đang bảo trì, chưa nhận đặt lịch.');
    }

    // Serializes one account's requests, otherwise parallel ones all read the same count.
    await tx.query('SELECT pg_advisory_xact_lock($1)', [booking.userId]);
    const pending = await tx.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM bookings WHERE user_id = $1 AND status = 'pending' AND lower(during) > now()`,
      [booking.userId],
    );
    if (pending.rows[0]!.count >= MAX_PENDING_PER_USER) {
      throw new AppError(429, 'TOO_MANY_PENDING', 'Bạn đang có 5 đơn chờ duyệt, vui lòng đợi xử lý.');
    }

    const total = hoursBetween(booking) * room.rows[0].price;
    const inserted = await tx.query<{ id: number }>(
      `INSERT INTO bookings (room_id, user_id, during, total_vnd, note)
       VALUES ($1, $2, tstzrange($3, $4, '[)'), $5, $6) RETURNING id`,
      [booking.roomId, booking.userId, booking.start, booking.end, total, booking.note],
    );
    return inserted.rows[0]!.id;
  });
}

async function createBooking(pool: Pool, booking: NewBooking): Promise<number> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await insertBooking(pool, booking);
    } catch (error) {
      const code = pgErrorCode(error);
      if (code === EXCLUSION_VIOLATION) {
        throw new AppError(409, 'SLOT_TAKEN', 'Khung giờ này vừa có người đặt, vui lòng chọn giờ khác.');
      }
      // Racing inserts can deadlock on the exclusion check; retrying yields a clean conflict.
      if (code !== DEADLOCK_DETECTED || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}

export async function findBooking(pool: Pool, id: number): Promise<unknown> {
  const result = await pool.query(
    `SELECT ${BOOKING_COLUMNS} FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE b.id = $1`,
    [id],
  );
  return result.rows[0];
}

export function createBookingsRouter(pool: Pool): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = parse(createSchema, req.body);
    const range = { start: new Date(input.start), end: new Date(input.end) };
    const issue = rangeIssue(range, new Date());
    if (issue) throw new AppError(422, issue, RANGE_MESSAGES[issue]);

    const id = await createBooking(pool, {
      ...range,
      roomId: input.roomId,
      userId: req.user!.id,
      note: input.note,
    });
    res.status(201).json({ data: await findBooking(pool, id) });
  });

  router.get('/mine', async (req, res) => {
    const result = await pool.query(
      `SELECT ${BOOKING_COLUMNS} FROM bookings b JOIN rooms r ON r.id = b.room_id
       WHERE b.user_id = $1 ORDER BY lower(b.during) DESC LIMIT 100`,
      [req.user!.id],
    );
    res.json({ data: result.rows });
  });

  router.post('/:id/cancel', async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const updated = await pool.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2
         AND status IN ('pending', 'confirmed') AND lower(during) > now()
       RETURNING id`,
      [id, req.user!.id],
    );
    if (updated.rowCount === 0) {
      const owned = await pool.query('SELECT 1 FROM bookings WHERE id = $1 AND user_id = $2', [id, req.user!.id]);
      if (owned.rowCount === 0) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt.');
      throw new AppError(409, 'NOT_CANCELLABLE', 'Đơn này không thể hủy nữa.');
    }
    res.json({ data: await findBooking(pool, id) });
  });

  return router;
}
