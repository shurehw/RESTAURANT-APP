import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import * as bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName } = await request.json();

    // Validate inputs
    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: 'Email, password, and full name are required' },
        { status: 400 }
      );
    }

    // Validate email domain
    if (!email.endsWith('@hwoodgroup.com')) {
      return NextResponse.json(
        { error: 'Only @hwoodgroup.com emails are allowed during beta' },
        { status: 403 }
      );
    }

    // Validate password length
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const adminClient = createAdminClient();
    
    // Check if user already exists in custom users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    // Check if auth user exists
    let existingAuth = null;
    try {
      const { data: existingAuthUsers } = await adminClient.auth.admin.listUsers();
      existingAuth = existingAuthUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
    } catch (listError) {
      console.error('Error listing auth users:', listError);
      // Continue - we'll try to create the auth user anyway
    }

    // If user exists in custom table but not in auth.users, create auth user and link them
    if (existingUser && !existingAuth) {
      // User exists in custom table but not in auth - create auth user and link to org
      console.log(`[SIGNUP] User ${email} exists in custom table (ID: ${existingUser.id}) but not in auth.users. Creating auth user...`);
      
      try {
        const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
          email: email.toLowerCase(),
          password: password, // Use the password they provided
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
          },
        });

        if (authError) {
          console.error('Error creating auth user for existing user:', authError);
          return NextResponse.json(
            { error: 'Account exists but could not create auth user. Please contact support.' },
            { status: 500 }
          );
        }

        // Link to organization if @hwoodgroup.com
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
                user_id: authUser.user.id,
                organization_id: org.id,
                role: 'viewer',
                is_active: true,
              }, {
                onConflict: 'organization_id,user_id'
              });
            console.log(`Linked existing user ${email} to h.wood group organization`);
          }
        }

        return NextResponse.json({
          success: true,
          message: 'Account linked successfully. You can now log in.',
        });
      } catch (err) {
        console.error('Error handling existing user:', err);
        return NextResponse.json(
          { error: 'Error processing account. Please contact support.' },
          { status: 500 }
        );
      }
    }

    // If user exists in both tables, they're already registered
    if (existingUser && existingAuth) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user in custom users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        full_name: fullName,
        role: 'readonly',
        is_active: true,
      })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Create Supabase Auth user for organization linking
    // organization_users table references auth.users, not the custom users table
    let authUserId: string | null = null;

    try {
      const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
        email: email.toLowerCase(),
        password: password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          full_name: fullName,
        },
      });

      if (authError) {
        console.error('Error creating Supabase Auth user:', authError);
        // Continue - user is created in custom table but may not be linkable to org
      } else {
        authUserId = authUser.user.id;
        console.log(`Created Supabase Auth user: ${authUserId}`);
      }
    } catch (authErr) {
      console.error('Exception creating Supabase Auth user:', authErr);
      // Continue - user is created in custom table
    }

    // Automatically assign @hwoodgroup.com users to h.wood group organization
    if (email.toLowerCase().endsWith('@hwoodgroup.com') && authUserId) {
      // Find the h.wood group organization (try slug first, then names)
      let org = null;
      
      // Try by slug first (most reliable)
      const { data: orgBySlug } = await adminClient
        .from('organizations')
        .select('id')
        .eq('slug', 'hwood-group')
        .single();

      if (orgBySlug) {
        org = orgBySlug;
      } else {
        // Try by name variations
        const { data: orgByName } = await adminClient
          .from('organizations')
          .select('id')
          .or('name.eq.The h.wood Group,name.eq.Hwood Group')
          .single();
        
        org = orgByName || null;
      }

      if (org) {
        // Link user to organization
        const { error: linkError } = await adminClient
          .from('organization_users')
          .insert({
            user_id: authUserId,
            organization_id: org.id,
            role: 'viewer', // Default role, can be changed by admin later
            is_active: true,
          })
          .select();

        if (linkError) {
          console.error('Error linking user to organization:', linkError);
          // Don't fail signup, but log the error
        } else {
          console.log(`Successfully linked user ${authUserId} to h.wood group organization`);
        }
      } else {
        console.error('h.wood group organization not found. User created but not linked to organization.');
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
