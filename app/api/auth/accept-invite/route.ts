/**
 * Accept Invite API
 *
 * GET  — Validate token and return invite metadata (for the form)
 * POST — Accept invite: create user, set org membership, sign in
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getInviteByToken, markInviteAccepted } from '@/lib/database/team';
import { getServiceClient } from '@/lib/supabase/service';
import { ROLE_LABELS } from '@/lib/nav/role-permissions';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';

const acceptSchema = z.object({
  token: z.string().min(1),
  full_name: z.string().min(1).max(100),
  password: z.string().min(6),
});

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json(
        { error: 'Missing token' },
        { status: 400 }
      );
    }

    const invite = await getInviteByToken(token);
    if (!invite) {
      return NextResponse.json(
        { error: 'Invalid, expired, or already used invitation' },
        { status: 404 }
      );
    }

    const roleName = ROLE_LABELS[invite.role as keyof typeof ROLE_LABELS] || invite.role;

    return NextResponse.json({
      success: true,
      invite: {
        org_name: invite.org_name,
        role: invite.role,
        role_name: roleName,
        email: invite.email,
      },
    });
  } catch (error) {
    console.error('[accept-invite] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { token, full_name, password } = parsed.data;

    // 1. Validate token
    const invite = await getInviteByToken(token);
    if (!invite) {
      return NextResponse.json(
        { error: 'Invalid, expired, or already used invitation' },
        { status: 404 }
      );
    }

    const adminClient = createAdminClient();
    const supabase = getServiceClient();
    let authUserId: string;

    // 2. Check if auth.users already exists for this email
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingAuth = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === invite.email.toLowerCase()
    );

    if (existingAuth) {
      // User exists — update their password and name
      await adminClient.auth.admin.updateUserById(existingAuth.id, {
        password,
        user_metadata: { full_name },
      });
      authUserId = existingAuth.id;
    } else {
      // Create new auth.users entry
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: invite.email.toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError || !newUser?.user) {
        console.error('[accept-invite] Failed to create auth user:', createError);
        return NextResponse.json(
          { error: 'Failed to create account. Please try again.' },
          { status: 500 }
        );
      }
      authUserId = newUser.user.id;
    }

    // 3. Create legacy users table entry (maintain parity)
    const passwordHash = await bcrypt.hash(password, 10);
    const { error: usersError } = await (supabase as any)
      .from('users')
      .upsert(
        {
          id: authUserId,
          email: invite.email.toLowerCase(),
          full_name,
          password_hash: passwordHash,
          role: invite.role,
          is_active: true,
        },
        { onConflict: 'email' }
      );

    if (usersError) {
      console.error('[accept-invite] Failed to upsert legacy users row:', usersError);
    }

    // 4. Upsert organization_users
    const { error: memberError } = await (supabase as any)
      .from('organization_users')
      .upsert(
        {
          user_id: authUserId,
          organization_id: invite.organization_id,
          role: invite.role,
          venue_ids: invite.venue_ids,
          is_active: true,
          invited_by: invite.invited_by,
          invited_at: new Date().toISOString(),
          accepted_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,user_id' }
      );

    if (memberError) {
      console.error('[accept-invite] Failed to create membership:', memberError);
      return NextResponse.json(
        { error: 'Failed to join organization. Please try again.' },
        { status: 500 }
      );
    }

    // 5. Mark invite accepted
    await markInviteAccepted(invite.id);

    // 6. Sign in via Supabase so session cookies are set
    const { error: signInError } = await adminClient.auth.signInWithPassword({
      email: invite.email.toLowerCase(),
      password,
    });

    if (signInError) {
      console.warn('[accept-invite] Auto sign-in failed:', signInError.message);
      // Non-fatal — user can log in manually
    }

    return NextResponse.json({
      success: true,
      redirect: '/',
    });
  } catch (error) {
    console.error('[accept-invite] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
