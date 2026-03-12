/**
 * Table Transition API
 *
 * POST /api/floor-plan/live/transition
 *
 * Transitions a table to a new state via the table state machine.
 * Used by the host stand and live floor UI for seat/clear/block actions.
 *
 * Body: {
 *   venue_id, table_id, date, action,
 *   reservation_id?, party_size?, expected_duration?, pos_check_id?
 * }
 *
 * Actions: reserve, seat, occupy, check_drop, bus, clear, block, unblock
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  reserveTable,
  seatTable,
  markOccupied,
  markCheckDropped,
  markBussing,
  clearTable,
  blockTable,
  unblockTable,
  type TableState,
  type TableTransitionResult,
} from '@/lib/floor-management/table-state-machine';

const VALID_ACTIONS = [
  'reserve', 'seat', 'occupy', 'check_drop', 'bus', 'clear', 'block', 'unblock',
] as const;

type TransitionAction = typeof VALID_ACTIONS[number];

export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const {
      venue_id,
      table_id,
      date,
      action,
      reservation_id,
      party_size,
      expected_duration,
      pos_check_id,
    } = body;

    if (!venue_id || !table_id || !date || !action) {
      return NextResponse.json(
        { error: 'venue_id, table_id, date, and action are required' },
        { status: 400 },
      );
    }
    assertVenueAccess(venue_id, venueIds);

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action: ${action}. Valid: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 },
      );
    }

    let result: TableTransitionResult;

    switch (action as TransitionAction) {
      case 'reserve':
        if (!reservation_id || !party_size) {
          return NextResponse.json(
            { error: 'reservation_id and party_size required for reserve' },
            { status: 400 },
          );
        }
        result = await reserveTable(venue_id, orgId, table_id, date, reservation_id, party_size, user.id);
        break;

      case 'seat':
        if (!party_size) {
          return NextResponse.json(
            { error: 'party_size required for seat' },
            { status: 400 },
          );
        }
        result = await seatTable(
          venue_id, orgId, table_id, date,
          reservation_id, party_size,
          expected_duration || 90, user.id,
        );
        break;

      case 'occupy':
        if (!pos_check_id) {
          return NextResponse.json(
            { error: 'pos_check_id required for occupy' },
            { status: 400 },
          );
        }
        result = await markOccupied(venue_id, orgId, table_id, date, pos_check_id);
        break;

      case 'check_drop':
        result = await markCheckDropped(venue_id, orgId, table_id, date);
        break;

      case 'bus':
        result = await markBussing(venue_id, orgId, table_id, date, user.id);
        break;

      case 'clear':
        result = await clearTable(venue_id, orgId, table_id, date, user.id);
        break;

      case 'block':
        result = await blockTable(venue_id, orgId, table_id, date, user.id);
        break;

      case 'unblock':
        result = await unblockTable(venue_id, orgId, table_id, date, user.id);
        break;

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, from_status: result.from_status, to_status: result.to_status },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: result.success,
      table_id: result.table_id,
      from_status: result.from_status,
      to_status: result.to_status,
    });
  });
}
