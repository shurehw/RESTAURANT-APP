/**
 * GET /api/enforcement/blocks - Check if entity is blocked
 * POST /api/enforcement/blocks/:id/lift - Lift a block
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import {
  isBlocked,
  getActiveBlocks,
  liftBlock,
  type BlockType,
} from '@/lib/database/enforcement';

/**
 * Check if an entity is blocked
 * Used by external systems (scheduling, POS, etc.)
 */
export async function GET(req: NextRequest) {
  try {
    const { user, profile } = await requireUser();
    const { searchParams } = new URL(req.url);

    const blockType = searchParams.get('block_type') as BlockType;
    const entityId = searchParams.get('entity_id');
    const mode = searchParams.get('mode') || 'check'; // 'check' or 'list'

    if (mode === 'check') {
      // Check specific entity
      if (!blockType || !entityId) {
        return NextResponse.json(
          { error: 'block_type and entity_id required' },
          { status: 400 }
        );
      }

      const blockStatus = await isBlocked(blockType, entityId);

      return NextResponse.json({
        blocked: !!blockStatus,
        ...blockStatus,
      });
    } else {
      // List all active blocks for org
      const blocks = await getActiveBlocks(profile.org_id, {
        blockType: blockType || undefined,
        entityId: entityId || undefined,
      });

      return NextResponse.json({ blocks });
    }
  } catch (error: any) {
    console.error('Failed to check blocks:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check blocks' },
      { status: 500 }
    );
  }
}
