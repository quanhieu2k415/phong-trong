import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from './db.js';
import { AppError, parse } from './errors.js';
import { atLocalHour, buildSlots, isValidDay, nextDay, type Range } from './time.js';

export const ROOM_COLUMNS = `id, name, description, capacity,
  hourly_price_vnd AS "hourlyPriceVnd", status`;

export const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

const dayQuery = z.object({ date: z.string().refine(isValidDay) });

export function createRoomsRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const result = await pool.query(`SELECT ${ROOM_COLUMNS} FROM rooms ORDER BY hourly_price_vnd, id`);
    res.json({ data: result.rows });
  });

  router.get('/:id', async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const result = await pool.query(`SELECT ${ROOM_COLUMNS} FROM rooms WHERE id = $1`, [id]);
    if (!result.rows[0]) throw new AppError(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
    res.json({ data: result.rows[0] });
  });

  router.get('/:id/availability', async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const { date } = parse(dayQuery, req.query);
    const room = await pool.query<{ status: string }>('SELECT status FROM rooms WHERE id = $1', [id]);
    if (!room.rows[0]) throw new AppError(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');

    const taken = await pool.query<Range>(
      `SELECT lower(during) AS start, upper(during) AS "end" FROM bookings
       WHERE room_id = $1 AND status IN ('pending', 'confirmed')
         AND during && tstzrange($2, $3, '[)')`,
      [id, atLocalHour(date, 0), atLocalHour(nextDay(date), 0)],
    );
    res.json({
      data: { date, roomStatus: room.rows[0].status, slots: buildSlots(date, taken.rows, new Date()) },
    });
  });

  return router;
}
