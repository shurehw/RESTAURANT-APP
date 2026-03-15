/**
 * Preshift Notes API
 *
 * PUT /api/preshift/notes
 * Body: { venue_id, business_date, ...note fields }
 *
 * Auto-saves manager-authored preshift notes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireContext } from '@/lib/auth/resolveContext';
import { upsertPreshiftNotes } from '@/lib/database/preshift';
import type { PreshiftNotesInput } from '@/lib/database/preshift';

export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireContext();

    const body = await request.json();
    const { venue_id, business_date, ...noteFields } = body;

    if (!venue_id || !business_date) {
      return NextResponse.json(
        { error: 'venue_id and business_date are required' },
        { status: 400 },
      );
    }

    // Extract only valid note fields
    const validFields: (keyof PreshiftNotesInput)[] = [
      'flow_of_service', 'announcements', 'service_notes',
      'food_notes', 'beverage_notes', 'company_news', 'zone_cleaning', 'eightysixed',
    ];

    const notes: Partial<PreshiftNotesInput> = {};
    for (const field of validFields) {
      if (noteFields[field] !== undefined) {
        notes[field] = noteFields[field];
      }
    }

    if (Object.keys(notes).length === 0) {
      return NextResponse.json(
        { error: 'No valid note fields provided' },
        { status: 400 },
      );
    }

    await upsertPreshiftNotes(
      ctx.orgId as string,
      venue_id,
      business_date,
      notes,
      ctx.authUserId,
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Preshift Notes API]', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: err.status || 500 },
    );
  }
}
