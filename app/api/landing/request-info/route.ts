/**
 * Landing Page — Request Info API
 * Captures early access requests from the coming-soon landing page.
 *
 * POST /api/landing/request-info
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, company, venues, role, message } = body;

    if (!name || !email || !company) {
      return NextResponse.json(
        { error: 'Name, email, and company are required' },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    const { error } = await (supabase as any)
      .from('landing_requests')
      .insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        company: company.trim(),
        venues: venues || null,
        role: role || null,
        message: message?.trim() || null,
        source: 'coming-soon',
      });

    if (error) {
      // If the table doesn't exist yet, log and succeed silently
      console.error('Landing request insert error:', error);
      console.log('Landing request data (fallback):', { name, email, company, venues, role, message });
      return NextResponse.json({ success: true, fallback: true });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Landing request API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
