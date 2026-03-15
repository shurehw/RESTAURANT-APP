/**
 * POST /api/contact
 * Receives marketing contact form submissions.
 * Stores in Supabase and optionally sends notification email.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    const { name, email, company, venues, message } = body;

    if (!name || !email || !company || !venues) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Store in Supabase (contact_requests table)
    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('contact_requests')
      .insert({
        name,
        email,
        company,
        venues,
        message: message || null,
        source: 'marketing_site',
      });

    if (error) {
      console.error('[contact] Failed to store:', error.message);
      // Don't fail the request — still return success to the user
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[contact] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
