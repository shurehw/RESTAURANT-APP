/**
 * Shared configuration loader for scripts.
 * Loads credentials from .env.local — never hardcode secrets in scripts.
 *
 * Usage:
 *   import { SUPABASE_URL, SUPABASE_SERVICE_KEY, TIPSEE_CONFIG, getSupabase, getTipseePool } from './_config.mjs';
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const CRON_SECRET = process.env.CRON_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

export const TIPSEE_CONFIG = {
  host: process.env.TIPSEE_DB_HOST,
  port: parseInt(process.env.TIPSEE_DB_PORT || '5432'),
  user: process.env.TIPSEE_DB_USER,
  password: process.env.TIPSEE_DB_PASSWORD,
  database: process.env.TIPSEE_DB_NAME || 'postgres',
  ssl: { rejectUnauthorized: false },
};

export function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export function getTipseePool() {
  if (!TIPSEE_CONFIG.host || !TIPSEE_CONFIG.user || !TIPSEE_CONFIG.password) {
    console.error('Missing TIPSEE_DB_HOST, TIPSEE_DB_USER, or TIPSEE_DB_PASSWORD in .env.local');
    process.exit(1);
  }
  // Dynamically import pg since not all scripts need it
  return import('pg').then(pg => new pg.default.Pool(TIPSEE_CONFIG));
}
