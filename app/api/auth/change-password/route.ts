/**
 * Change Password API
 *
 * POST — Update password in both legacy users table and Supabase auth.users
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Look up legacy users row to verify current password
    const { data: legacyUser, error: lookupError } = await adminClient
      .from('users')
      .select('id, email, password_hash')
      .eq('email', user.email?.toLowerCase())
      .single();

    if (lookupError || !legacyUser) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, legacyUser.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // Update legacy users table
    const newHash = await bcrypt.hash(newPassword, 10);
    const { error: updateError } = await adminClient
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', legacyUser.id);

    if (updateError) {
      console.error('[change-password] Failed to update users table:', updateError);
      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      );
    }

    // Update Supabase auth.users
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (authUpdateError) {
      console.error('[change-password] Failed to update auth.users:', authUpdateError);
      // Non-fatal — legacy table is already updated
    }

    // Re-sign in to refresh session
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: newPassword,
    });

    if (signInError) {
      console.warn('[change-password] Re-sign-in failed (non-fatal):', signInError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[change-password] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
