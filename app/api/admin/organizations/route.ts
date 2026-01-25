/**
 * Admin API: Organizations
 * GET  - List all organizations
 * POST - Create new organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/requirePlatformAdmin';
import { createAdminClient } from '@/lib/supabase/server';

// GET /api/admin/organizations - List all organizations
export async function GET() {
  try {
    await requirePlatformAdmin();
    
    const adminClient = createAdminClient();
    
    const { data: organizations, error } = await adminClient
      .from('organizations')
      .select(`
        id,
        name,
        slug,
        is_active,
        created_at,
        organization_users (
          id,
          user_id,
          role,
          is_active
        )
      `)
      .order('name');

    if (error) {
      console.error('Error fetching organizations:', error);
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }

    // Enrich with member count
    const enriched = organizations?.map(org => ({
      ...org,
      member_count: org.organization_users?.filter((m: { is_active: boolean }) => m.is_active).length || 0,
    }));

    return NextResponse.json({ organizations: enriched });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Admin organizations GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/organizations - Create new organization
export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    
    const body = await request.json();
    const { name, slug, ownerEmail } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Validate slug format (lowercase, alphanumeric, hyphens)
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      return NextResponse.json({ 
        error: 'Slug must be lowercase alphanumeric with hyphens only' 
      }, { status: 400 });
    }

    // Check if slug already exists
    const { data: existing } = await adminClient
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Organization slug already exists' }, { status: 409 });
    }

    // Create organization
    const { data: newOrg, error: orgError } = await adminClient
      .from('organizations')
      .insert({
        name,
        slug,
        is_active: true,
      })
      .select()
      .single();

    if (orgError) {
      console.error('Error creating organization:', orgError);
      return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
    }

    // If owner email provided, add them as owner
    if (ownerEmail) {
      // Find user in auth.users
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const ownerUser = authUsers?.users?.find(
        u => u.email?.toLowerCase() === ownerEmail.toLowerCase()
      );

      if (ownerUser) {
        const { error: memberError } = await adminClient
          .from('organization_users')
          .insert({
            organization_id: newOrg.id,
            user_id: ownerUser.id,
            role: 'owner',
            is_active: true,
          });

        if (memberError) {
          console.error('Error adding owner:', memberError);
          // Org created but owner not added - return partial success
          return NextResponse.json({ 
            organization: newOrg, 
            warning: 'Organization created but could not add owner' 
          }, { status: 201 });
        }
      } else {
        return NextResponse.json({ 
          organization: newOrg, 
          warning: `Organization created but owner email '${ownerEmail}' not found in system` 
        }, { status: 201 });
      }
    }

    // Initialize organization settings
    await adminClient
      .from('organization_settings')
      .insert({
        organization_id: newOrg.id,
        settings: {},
      })
      .single();

    // Initialize organization usage
    await adminClient
      .from('organization_usage')
      .insert({
        organization_id: newOrg.id,
        month: new Date().toISOString().slice(0, 7), // YYYY-MM
        invoice_count: 0,
        ocr_pages: 0,
      })
      .single();

    return NextResponse.json({ organization: newOrg }, { status: 201 });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Admin organizations POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
