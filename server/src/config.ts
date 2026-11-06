import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3001),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  TRUST_PROXY: z.coerce.number().int().min(0).optional(),
  LOGIN_LIMIT: z.coerce.number().int().positive().default(10),
  REGISTER_LIMIT: z.coerce.number().int().positive().default(10),
});

export interface Config {
  databaseUrl: string;
  jwtSecret: string;
  isProduction: boolean;
  port: number;
  bcryptRounds: number;
  trustProxy: number;
  loginLimit: number;
  registerLimit: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment: ${fields}. See .env.example.`);
  }
  const value = parsed.data;
  // Only an explicit opt-out relaxes the checks, so a forgotten NODE_ENV fails safe.
  const isProduction = value.NODE_ENV !== 'development';
  if (isProduction && value.JWT_SECRET.includes('change-me')) {
    throw new Error('JWT_SECRET still has the example value. Generate a new one for production.');
  }
  if (isProduction && value.TRUST_PROXY === undefined) {
    throw new Error('Set TRUST_PROXY in production: 0 without a reverse proxy, otherwise the number of proxies.');
  }
  return {
    databaseUrl: value.DATABASE_URL,
    jwtSecret: value.JWT_SECRET,
    isProduction,
    port: value.PORT,
    bcryptRounds: value.BCRYPT_ROUNDS,
    trustProxy: value.TRUST_PROXY ?? 0,
    loginLimit: value.LOGIN_LIMIT,
    registerLimit: value.REGISTER_LIMIT,
  };
}
