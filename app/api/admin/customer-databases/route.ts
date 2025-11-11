import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { encryptPassword } from '@/lib/database/encryption';
import { testDatabaseConnection, closePool } from '@/lib/database/connection-manager';
import { z } from 'zod';

const createDatabaseSchema = z.object({
  db_host: z.string().min(1),
  db_port: z.number().int().min(1).max(65535).default(5432),
  db_name: z.string().min(1),
  db_user: z.string().min(1),
  db_password: z.string().min(1),
  db_ssl: z.boolean().default(true),
  db_ssl_mode: z.enum(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']).default('require'),
  pool_min: z.number().int().min(1).max(50).default(2),
  pool_max: z.number().int().min(1).max(100).default(10),
});

const updateDatabaseSchema = createDatabaseSchema.partial();

/**
 * GET - Retrieve customer database configuration
 */
export async function GET(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    // Only owners can view database config
    if (role !== 'owner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('customer_databases')
      .select('id, organization_id, db_host, db_port, db_name, db_user, db_ssl, db_ssl_mode, pool_min, pool_max, is_active, last_connection_test, last_connection_status, connection_error, created_at, updated_at')
      .eq('organization_id', orgId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return NextResponse.json({ database: data || null });
  });
}

/**
 * POST - Create customer database configuration
 */
export async function POST(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    // Only owners can configure database
    if (role !== 'owner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const validated = createDatabaseSchema.parse(body);

    // Encrypt password
    const encryptedPassword = encryptPassword(validated.db_password);

    const supabase = await createClient();

    // Insert database config
    const { data, error } = await supabase
      .from('customer_databases')
      .insert({
        organization_id: orgId,
        db_host: validated.db_host,
        db_port: validated.db_port,
        db_name: validated.db_name,
        db_user: validated.db_user,
        db_password_encrypted: encryptedPassword,
        db_ssl: validated.db_ssl,
        db_ssl_mode: validated.db_ssl_mode,
        pool_min: validated.pool_min,
        pool_max: validated.pool_max,
        created_by: user.id,
        is_active: false, // Inactive until tested
        last_connection_status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    // Test connection
    const testResult = await testDatabaseConnection(orgId);

    // Update with test results
    await supabase
      .from('customer_databases')
      .update({
        last_connection_test: new Date().toISOString(),
        last_connection_status: testResult.success ? 'success' : 'failed',
        connection_error: testResult.error || null,
        is_active: testResult.success,
      })
      .eq('id', data.id);

    return NextResponse.json({
      database: data,
      test_result: testResult,
    });
  });
}

/**
 * PATCH - Update customer database configuration
 */
export async function PATCH(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (role !== 'owner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const validated = updateDatabaseSchema.parse(body);

    const updates: any = { ...validated };

    // Encrypt password if provided
    if (validated.db_password) {
      updates.db_password_encrypted = encryptPassword(validated.db_password);
      delete updates.db_password;
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('customer_databases')
      .update(updates)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;

    // Clear connection pool to force reconnect with new config
    await closePool(orgId);

    // Test new connection
    const testResult = await testDatabaseConnection(orgId);

    // Update test results
    await supabase
      .from('customer_databases')
      .update({
        last_connection_test: new Date().toISOString(),
        last_connection_status: testResult.success ? 'success' : 'failed',
        connection_error: testResult.error || null,
        is_active: testResult.success,
      })
      .eq('id', data.id);

    return NextResponse.json({
      database: data,
      test_result: testResult,
    });
  });
}

/**
 * DELETE - Remove customer database configuration
 */
export async function DELETE(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (role !== 'owner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Close connection pool first
    await closePool(orgId);

    const supabase = await createClient();
    const { error } = await supabase
      .from('customer_databases')
      .delete()
      .eq('organization_id', orgId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  });
}
