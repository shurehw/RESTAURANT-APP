/**
 * Control Plane Actions API
 * Fetch and update manager actions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveActions, completeAction, dismissAction } from '@/lib/database/control-plane';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const venueId = searchParams.get('venue_id');
    const assignedTo = searchParams.get('assigned_to');

    if (!venueId) {
      return NextResponse.json(
        { error: 'venue_id is required' },
        { status: 400 }
      );
    }

    const actions = await getActiveActions(venueId, assignedTo || undefined);

    return NextResponse.json({
      success: true,
      actions,
    });
  } catch (error: any) {
    console.error('Control Plane actions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action_id, status, notes } = body;

    if (!action_id || !status) {
      return NextResponse.json(
        { error: 'action_id and status are required' },
        { status: 400 }
      );
    }

    let result;
    const completedBy = 'Manager'; // TODO: Get from auth context

    if (status === 'completed') {
      result = await completeAction(action_id, completedBy, notes);
    } else if (status === 'dismissed') {
      result = await dismissAction(action_id, completedBy, notes);
    } else {
      return NextResponse.json(
        { error: 'Invalid status. Must be "completed" or "dismissed"' },
        { status: 400 }
      );
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Action ${status}`,
    });
  } catch (error: any) {
    console.error('Control Plane actions update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
