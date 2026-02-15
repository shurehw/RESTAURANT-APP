/**
 * POST /api/enforcement/blocks/:id/lift - Lift a block
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { liftBlock } from '@/lib/database/enforcement';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, profile } = await requireUser();
    const { lift_reason } = await req.json();

    await liftBlock(params.id, user.id, lift_reason);

    return NextResponse.json({
      success: true,
      message: 'Block lifted',
    });
  } catch (error: any) {
    console.error('Failed to lift block:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to lift block' },
      { status: 500 }
    );
  }
}
