import bcrypt from 'bcryptjs';
import { Router, type CookieOptions, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Pool } from './db.js';
import { AppError, parse, pgErrorCode } from './errors.js';

const COOKIE = 'session';
const SESSION_SECONDS = 7 * 24 * 3600;
const UNIQUE_VIOLATION = '23505';

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: 'customer' | 'admin';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const registerSchema = z.object({
  email,
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(2).max(100),
});
const loginSchema = z.object({ email, password: z.string().min(1).max(72) });

const USER_COLUMNS = 'id, email, full_name AS "fullName", role';

export function createAuth(pool: Pool, config: Config) {
  // Compared against when the email is unknown, so both login failures cost the same time.
  const dummyHash = bcrypt.hashSync('no-such-user', config.bcryptRounds);

  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProduction,
    path: '/',
  };

  function startSession(res: Response, user: User): void {
    const token = jwt.sign({ sub: String(user.id) }, config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: SESSION_SECONDS,
    });
    res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS * 1000 });
  }

  async function loadUser(req: Request): Promise<User | undefined> {
    const token: unknown = req.cookies?.[COOKIE];
    if (typeof token !== 'string') return undefined;
    try {
      const { sub } = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      const result = await pool.query<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [Number(sub)]);
      return result.rows[0];
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) return undefined;
      throw error;
    }
  }

  const attachUser: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
    req.user = await loadUser(req);
    next();
  };

  const requireUser: RequestHandler = (req, _res, next) => {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập.');
    next();
  };

  const requireAdmin: RequestHandler = (req, _res, next) => {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập.');
    if (req.user.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền truy cập.');
    next();
  };

  const limitOptions = {
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Bạn thử quá nhiều lần, vui lòng thử lại sau.' } },
  } as const;
  const loginLimiter = rateLimit({
    ...limitOptions,
    windowMs: 15 * 60_000,
    limit: config.loginLimit,
    skipSuccessfulRequests: true,
  });
  // Successful sign-ups count too: each new account can hold more pending bookings.
  const registerLimiter = rateLimit({ ...limitOptions, windowMs: 60 * 60_000, limit: config.registerLimit });

  const router = Router();

  router.post('/register', registerLimiter, async (req, res) => {
    const input = parse(registerSchema, req.body);
    const hash = await bcrypt.hash(input.password, config.bcryptRounds);
    try {
      const result = await pool.query<User>(
        `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
        [input.email, hash, input.fullName],
      );
      const user = result.rows[0]!;
      startSession(res, user);
      res.status(201).json({ data: user });
    } catch (error) {
      if (pgErrorCode(error) === UNIQUE_VIOLATION) {
        throw new AppError(409, 'EMAIL_TAKEN', 'Email này đã được đăng ký.');
      }
      throw error;
    }
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const input = parse(loginSchema, req.body);
    const result = await pool.query<User & { passwordHash: string }>(
      `SELECT ${USER_COLUMNS}, password_hash AS "passwordHash" FROM users WHERE email = $1`,
      [input.email],
    );
    const row = result.rows[0];
    const matches = await bcrypt.compare(input.password, row?.passwordHash ?? dummyHash);
    if (!row || !matches) throw new AppError(401, 'BAD_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');

    const { passwordHash: _omitted, ...user } = row;
    startSession(res, user);
    res.json({ data: user });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE, cookieOptions);
    res.status(204).end();
  });

  router.get('/me', (req, res) => {
    res.json({ data: req.user ?? null });
  });

  return { router, attachUser, requireUser, requireAdmin };
}
