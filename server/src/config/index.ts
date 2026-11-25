import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/gogo'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:4200'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default('gogo-moments'),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  PLACES_DAILY_CAP: z.coerce.number().default(200),
});

export const config = schema.parse(process.env);

if (config.NODE_ENV === 'production' && config.JWT_ACCESS_SECRET.startsWith('dev-')) {
  throw new Error('Cần đặt JWT_ACCESS_SECRET thật khi chạy production.');
}
export type Config = typeof config;
