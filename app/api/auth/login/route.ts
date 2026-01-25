import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import * as bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Validate inputs
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Get user from custom users table (legacy auth source)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if user is active
    if (!user.is_active) {
      return NextResponse.json(
        { error: 'Account is inactive' },
        { status: 403 }
      );
    }

    // Verify password against custom users table
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // ========================================================================
    // PHASE 1: Transparent auth.users sync
    // Ensure user has a corresponding auth.users entry for org membership
    // ========================================================================
    let authUserId: string | null = null;
    
    try {
      // Check if auth.users entry exists
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const existingAuthUser = authUsers?.users?.find(
        u => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (existingAuthUser) {
        authUserId = existingAuthUser.id;
        // Sync password to auth.users so Supabase session works
        await adminClient.auth.admin.updateUserById(existingAuthUser.id, {
          password: password,
        });
      } else {
        // Create auth.users entry (first-time sync)
        const { data: newAuthUser, error: createError } = await adminClient.auth.admin.createUser({
          email: email.toLowerCase(),
          password: password,
          email_confirm: true,
          user_metadata: { full_name: user.full_name },
        });
        
        if (!createError && newAuthUser?.user) {
          authUserId = newAuthUser.user.id;
          console.log(`[LOGIN] Created auth.users entry for ${email}: ${authUserId}`);
          
          // Auto-link to organization if @hwoodgroup.com
          if (email.toLowerCase().endsWith('@hwoodgroup.com')) {
            const { data: org } = await adminClient
              .from('organizations')
              .select('id')
              .or('slug.eq.hwood-group,name.eq.The h.wood Group,name.eq.Hwood Group')
              .single();
            
            if (org) {
              await adminClient
                .from('organization_users')
                .upsert({
                  user_id: authUserId,
                  organization_id: org.id,
                  role: 'viewer',
                  is_active: true,
                }, { onConflict: 'organization_id,user_id' });
              console.log(`[LOGIN] Linked ${email} to h.wood group organization`);
            }
          }
        }
      }

      // Sign in via Supabase Auth to set proper session cookies
      if (authUserId) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.toLowerCase(),
          password: password,
        });
        
        if (signInError) {
          console.error('[LOGIN] Supabase signIn error (non-fatal):', signInError.message);
        }
      }
    } catch (authSyncError) {
      // Non-fatal: log but continue with legacy auth
      console.error('[LOGIN] Auth sync error (non-fatal):', authSyncError);
    }

    // ========================================================================
    // Legacy session: keep user_id cookie for backward compatibility
    // This ensures existing pages continue to work during migration
    // ========================================================================
    const cookieStore = await cookies();
    cookieStore.set('user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
