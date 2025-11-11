import { createClient } from '@/lib/supabase/server';
import { getDatabaseForOrg, hasCustomDatabase } from './connection-manager';

/**
 * Unified database query interface
 * Automatically routes to Supabase or customer PostgreSQL
 */
export async function queryDatabase(organizationId: string) {
  const hasCustomDb = await hasCustomDatabase(organizationId);

  if (hasCustomDb) {
    // Return PostgreSQL client
    const pool = await getDatabaseForOrg(organizationId);
    if (!pool) throw new Error('Failed to get database connection');

    return {
      type: 'postgres' as const,
      async query(sql: string, params?: any[]) {
        const result = await pool.query(sql, params);
        return result.rows;
      },
      async queryOne(sql: string, params?: any[]) {
        const result = await pool.query(sql, params);
        return result.rows[0] || null;
      },
    };
  } else {
    // Return Supabase client
    const supabase = await createClient();

    return {
      type: 'supabase' as const,
      client: supabase,
      // Helper methods for common operations
      async from(table: string) {
        return supabase.from(table);
      },
    };
  }
}

/**
 * Execute raw SQL query (for customers with PostgreSQL)
 * Falls back to Supabase RPC for standard customers
 */
export async function executeRawSQL(
  organizationId: string,
  sql: string,
  params?: any[]
): Promise<any[]> {
  const db = await queryDatabase(organizationId);

  if (db.type === 'postgres') {
    return db.query(sql, params);
  } else {
    // For Supabase, you'd need to create RPC functions
    throw new Error('Raw SQL not supported for Supabase clients - use .from() methods');
  }
}
