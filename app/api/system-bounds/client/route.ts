/**
 * System Bounds Client API
 * Public endpoint for UI components to fetch Layer 0 bounds
 *
 * GET /api/system-bounds/client
 */

import { NextResponse } from 'next/server';
import { getLaborBounds } from '@/lib/database/system-bounds';

/**
 * GET: Retrieve active system bounds for client use
 */
export async function GET() {
  try {
    const bounds = await getLaborBounds();

    return NextResponse.json({
      success: true,
      data: bounds,
    });
  } catch (error: any) {
    console.error('Get system bounds (client) error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
