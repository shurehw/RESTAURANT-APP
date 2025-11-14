/**
 * lib/supabase/service.ts
 * Supabase client with service role key for privileged operations.
 *
 * WARNING: Use this ONLY for:
 * 1. System operations that need to bypass RLS (migrations, cron jobs)
 * 2. Operations where user auth context is not available (webhooks)
 * 3. Admin operations explicitly approved by security review
 *
 * DO NOT use for regular user operations - use createClient from server.ts instead
 */

import { createClient } from '@supabase/supabase-js';

let serviceClient: ReturnType<typeof createClient> | null = null;

/**
 * Get service role client (bypasses RLS)
 * Use with extreme caution - this has full database access
 */
export function getServiceClient() {
  if (!serviceClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase service role credentials');
    }

    serviceClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return serviceClient;
}
