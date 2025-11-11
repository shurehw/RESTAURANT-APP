import { Pool, PoolClient, QueryResult } from 'pg';
import { createClient } from '@/lib/supabase/server';
import { decryptPassword } from './encryption';

// Global connection pool cache
const connectionPools = new Map<string, Pool>();

interface CustomerDatabaseConfig {
  id: string;
  organization_id: string;
  db_host: string;
  db_port: number;
  db_name: string;
  db_user: string;
  db_password_encrypted: string;
  db_ssl: boolean;
  db_ssl_mode: string;
  pool_min: number;
  pool_max: number;
  is_active: boolean;
}

/**
 * Get database connection for an organization
 * Returns customer's PostgreSQL if configured, otherwise Supabase client
 */
export async function getDatabaseForOrg(organizationId: string): Promise<Pool | null> {
  // Check cache first
  if (connectionPools.has(organizationId)) {
    return connectionPools.get(organizationId)!;
  }

  // Fetch customer database config from Supabase
  const supabase = await createClient();
  const { data: config, error } = await supabase
    .from('customer_databases')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .single();

  if (error || !config) {
    // No custom database - return null (caller will use Supabase)
    return null;
  }

  // Create connection pool
  const pool = createConnectionPool(config);

  // Cache it
  connectionPools.set(organizationId, pool);

  return pool;
}

/**
 * Create a PostgreSQL connection pool
 */
function createConnectionPool(config: CustomerDatabaseConfig): Pool {
  const password = decryptPassword(config.db_password_encrypted);

  const pool = new Pool({
    host: config.db_host,
    port: config.db_port,
    database: config.db_name,
    user: config.db_user,
    password,
    min: config.pool_min,
    max: config.pool_max,
    ssl: config.db_ssl
      ? {
          rejectUnauthorized: config.db_ssl_mode === 'verify-full',
        }
      : undefined,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
  });

  return pool;
}

/**
 * Test database connection
 */
export async function testDatabaseConnection(
  organizationId: string
): Promise<{ success: boolean; error?: string; latency?: number }> {
  try {
    const pool = await getDatabaseForOrg(organizationId);

    if (!pool) {
      return { success: false, error: 'No customer database configured' };
    }

    const start = Date.now();
    const result = await pool.query('SELECT NOW()');
    const latency = Date.now() - start;

    return { success: true, latency };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute query on customer database or Supabase
 */
export async function executeQuery(
  organizationId: string,
  query: string,
  params?: any[]
): Promise<QueryResult> {
  const pool = await getDatabaseForOrg(organizationId);

  if (!pool) {
    throw new Error('Use Supabase client for organizations without custom databases');
  }

  return pool.query(query, params);
}

/**
 * Get a client for transaction support
 */
export async function getClient(organizationId: string): Promise<PoolClient | null> {
  const pool = await getDatabaseForOrg(organizationId);
  if (!pool) return null;
  return pool.connect();
}

/**
 * Close all connection pools (for graceful shutdown)
 */
export async function closeAllPools(): Promise<void> {
  const promises = Array.from(connectionPools.values()).map((pool) => pool.end());
  await Promise.all(promises);
  connectionPools.clear();
}

/**
 * Close connection pool for specific organization
 */
export async function closePool(organizationId: string): Promise<void> {
  const pool = connectionPools.get(organizationId);
  if (pool) {
    await pool.end();
    connectionPools.delete(organizationId);
  }
}

/**
 * Check if organization has custom database configured
 */
export async function hasCustomDatabase(organizationId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('customer_databases')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .single();

  return !!data;
}
