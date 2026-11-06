import bcrypt from 'bcryptjs';
import type { Pool } from './db.js';
import { atLocalHour, localDay } from './time.js';

const ROOMS = [
  ['Phòng Sen', 'Phòng họp nhỏ cho nhóm 4 người, có màn hình 55 inch và bảng trắng.', 4, 120_000],
  ['Phòng Trúc', 'Không gian yên tĩnh cho phỏng vấn hoặc làm việc nhóm, có ánh sáng tự nhiên.', 6, 180_000],
  ['Phòng Mai', 'Phòng 10 chỗ có máy chiếu và hệ thống họp trực tuyến.', 10, 280_000],
  ['Studio Tre', 'Studio cách âm để quay video, podcast và livestream.', 5, 350_000],
  ['Hội trường Đào', 'Hội trường 40 chỗ cho workshop, đào tạo và sự kiện nhỏ.', 40, 750_000],
] as const;

const DEMO_DAYS = 30;
// [days from today, room index, start hour, hours, status]: late hours so today's rows stay upcoming.
const UPCOMING = [
  [0, 0, 18, 2, 'confirmed'],
  [0, 3, 19, 3, 'pending'],
  [1, 0, 9, 3, 'confirmed'],
  [1, 2, 14, 2, 'pending'],
  [2, 1, 10, 2, 'pending'],
  [3, 4, 8, 4, 'confirmed'],
  [4, 3, 15, 2, 'confirmed'],
] as const;
const BCRYPT_ROUNDS = 12;

async function upsertUser(
  pool: Pool,
  email: string,
  password: string,
  fullName: string,
  role: 'admin' | 'customer',
): Promise<number> {
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
    [email, hash, fullName, role],
  );
  return result.rows[0]!.id;
}

const EXAMPLE_PASSWORDS = new Set(['admin-local-123', 'khach-local-123']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The example passwords are public in the repository, so they must never reach a shared database. */
export function assertSafeSeed(databaseUrl: string, passwords: { ADMIN_PASSWORD: string; DEMO_PASSWORD: string }): void {
  if (LOCAL_HOSTS.has(new URL(databaseUrl).hostname)) return;
  if (EXAMPLE_PASSWORDS.has(passwords.ADMIN_PASSWORD) || EXAMPLE_PASSWORDS.has(passwords.DEMO_PASSWORD)) {
    throw new Error('Refusing to seed the example passwords on a remote database. Set new ones first.');
  }
}

/** Fills an empty database with sample rooms and invented bookings for the demo. */
export async function seed(pool: Pool, env: NodeJS.ProcessEnv): Promise<void> {
  const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_EMAIL, DEMO_PASSWORD } = env;
  if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD || !DEMO_EMAIL || !DEMO_PASSWORD) {
    throw new Error('Set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_EMAIL and DEMO_PASSWORD before seeding.');
  }
  assertSafeSeed(DATABASE_URL, { ADMIN_PASSWORD, DEMO_PASSWORD });
  const existing = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM rooms');
  if (existing.rows[0]!.count > 0) return;

  const adminId = await upsertUser(pool, ADMIN_EMAIL, ADMIN_PASSWORD, 'Quản trị viên', 'admin');
  const demoId = await upsertUser(pool, DEMO_EMAIL, DEMO_PASSWORD, 'Khách Demo', 'customer');

  const rooms: { id: number; price: number }[] = [];
  for (const [name, description, capacity, price] of ROOMS) {
    const room = await pool.query<{ id: number }>(
      `INSERT INTO rooms (name, description, capacity, hourly_price_vnd) VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, description, capacity, price],
    );
    rooms.push({ id: room.rows[0]!.id, price });
  }

  // A fixed pattern rather than randomness, so every fresh demo shows the same chart.
  const today = Date.now();
  for (let daysAgo = 1; daysAgo <= DEMO_DAYS; daysAgo += 1) {
    const day = localDay(new Date(today - daysAgo * 86_400_000));
    const room = rooms[daysAgo % rooms.length]!;
    const startHour = 8 + (daysAgo * 3) % 8;
    const hours = 1 + (daysAgo * 5) % 4;
    await pool.query(
      `INSERT INTO bookings (room_id, user_id, during, status, total_vnd, decided_by, decided_at)
       VALUES ($1, $2, tstzrange($3, $4, '[)'), 'confirmed', $5, $6, $3)`,
      [room.id, demoId, atLocalHour(day, startHour), atLocalHour(day, startHour + hours), hours * room.price, adminId],
    );
  }

  for (const [daysAhead, roomIndex, startHour, hours, status] of UPCOMING) {
    const day = localDay(new Date(today + daysAhead * 86_400_000));
    const room = rooms[roomIndex]!;
    const confirmed = status === 'confirmed';
    await pool.query(
      `INSERT INTO bookings (room_id, user_id, during, status, total_vnd, decided_by, decided_at)
       VALUES ($1, $2, tstzrange($3, $4, '[)'), $5, $6, $7, $8)`,
      [
        room.id,
        demoId,
        atLocalHour(day, startHour),
        atLocalHour(day, startHour + hours),
        status,
        hours * room.price,
        confirmed ? adminId : null,
        confirmed ? new Date(today) : null,
      ],
    );
  }
}
