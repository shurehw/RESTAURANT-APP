/**
 * Admin API: Organization Members
 * GET    - List members of an organization
 * POST   - Add member to organization
 * PATCH  - Update member role/status
 * DELETE - Remove member from organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/requirePlatformAdmin';
import { createAdminClient } from '@/lib/supabase/server';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/organizations/[id]/members
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePlatformAdmin();
    const { id: orgId } = await params;
    
    const adminClient = createAdminClient();
    
    // Get organization members
    const { data: members, error } = await adminClient
      .from('organization_users')
      .select('id, user_id, role, is_active, created_at')
      .eq('organization_id', orgId)
      .order('created_at');

    if (error) {
      console.error('Error fetching members:', error);
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    // Enrich with user email from auth.users
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    
    const enrichedMembers = members?.map(member => {
      const authUser = authUsers?.users?.find(u => u.id === member.user_id);
      return {
        ...member,
        email: authUser?.email || 'Unknown',
        full_name: authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || 'Unknown',
      };
    });

    return NextResponse.json({ members: enrichedMembers });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Admin members GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/organizations/[id]/members - Add member
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePlatformAdmin();
    const { id: orgId } = await params;
    
    const body = await request.json();
    const { email, role = 'viewer' } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const validRoles = ['owner', 'admin', 'manager', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Find user in auth.users
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    const targetUser = authUsers?.users?.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!targetUser) {
      return NextResponse.json({ 
        error: `User with email '${email}' not found. They need to sign up first.` 
      }, { status: 404 });
    }

    // Check if already a member
    const { data: existing } = await adminClient
      .from('organization_users')
      .select('id, is_active')
      .eq('organization_id', orgId)
      .eq('user_id', targetUser.id)
      .single();

    if (existing) {
      if (existing.is_active) {
        return NextResponse.json({ error: 'User is already a member of this organization' }, { status: 409 });
      }
      
      // Reactivate inactive membership
      const { data: reactivated, error: updateError } = await adminClient
        .from('organization_users')
        .update({ is_active: true, role })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error reactivating member:', updateError);
        return NextResponse.json({ error: 'Failed to reactivate member' }, { status: 500 });
      }

      return NextResponse.json({ 
        member: { ...reactivated, email: targetUser.email },
        message: 'Member reactivated' 
      }, { status: 200 });
    }

    // Add new member
    const { data: newMember, error: insertError } = await adminClient
      .from('organization_users')
      .insert({
        organization_id: orgId,
        user_id: targetUser.id,
        role,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error adding member:', insertError);
      return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
    }

    return NextResponse.json({ 
      member: { ...newMember, email: targetUser.email } 
    }, { status: 201 });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Admin members POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/organizations/[id]/members - Update member
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePlatformAdmin();
    const { id: orgId } = await params;
    
    const body = await request.json();
    const { memberId, role, is_active } = body;

    if (!memberId) {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const updates: Record<string, unknown> = {};
    if (role !== undefined) {
      const validRoles = ['owner', 'admin', 'manager', 'viewer'];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: `Role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
      }
      updates.role = role;
    }
    if (is_active !== undefined) {
      updates.is_active = is_active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { data: updated, error } = await adminClient
      .from('organization_users')
      .update(updates)
      .eq('id', memberId)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) {
      console.error('Error updating member:', error);
      return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
    }

    return NextResponse.json({ member: updated });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Admin members PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/organizations/[id]/members - Remove member
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePlatformAdmin();
    const { id: orgId } = await params;
    
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');

    if (!memberId) {
      return NextResponse.json({ error: 'memberId query param is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Soft delete (deactivate) rather than hard delete
    const { error } = await adminClient
      .from('organization_users')
      .update({ is_active: false })
      .eq('id', memberId)
      .eq('organization_id', orgId);

    if (error) {
      console.error('Error removing member:', error);
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Member removed' });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Admin members DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
