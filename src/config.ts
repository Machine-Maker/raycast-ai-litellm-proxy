import * as dotenv from 'dotenv';
import { z } from 'zod/v4';
import {
  DEFAULT_PORT,
  DEFAULT_BASE_URL,
  DEFAULT_PING_INTERVAL,
  DEFAULT_REFRESH_INTERVAL,
} from './constants.js';

export const Config = z.object({
  port: z.coerce.number().int().positive().default(DEFAULT_PORT),
  apiKey: z
    .string()
    .trim()
    .min(1, 'API_KEY environment variable is required. Check your .env file'),
  baseUrl: z
    .url('BASE_URL must be a valid URL (e.g., http://localhost:4000/v1)')
    .default(DEFAULT_BASE_URL),
  pingInterval: z.coerce.number().int().positive().default(DEFAULT_PING_INTERVAL),
  modelRefreshInterval: z.coerce.number().int().positive().default(DEFAULT_REFRESH_INTERVAL),
});
export type Config = z.infer<typeof Config>;

export const getConfig = (): Config => {
  dotenv.config();
  return Config.parse({
    port: process.env.PORT,
    apiKey: process.env.API_KEY,
    baseUrl: process.env.BASE_URL,
    pingInterval: process.env.PING_INTERVAL,
    modelRefreshInterval: process.env.MODEL_REFRESH_INTERVAL,
  });
};
