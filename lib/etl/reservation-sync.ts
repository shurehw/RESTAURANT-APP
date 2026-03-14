/**
 * lib/etl/reservation-sync.ts
 * SevenRooms → KevaOS reservation sync pipeline.
 *
 * Adapts the existing SR API client to populate the native reservations table.
 * SR becomes a booking inlet; KevaOS is the system of record.
 */

import {
  fetchReservationsForVenueDate,
  resolveSevenRoomsVenueId,
  type SevenRoomsReservation,
} from '@/lib/integrations/sevenrooms';
import {
  upsertReservation,
  insertReservationEvent,
  type ReservationStatus,
} from '@/lib/database/reservations';

// ── Status Mapping ───────────────────────────────────────────────

const SR_STATUS_MAP: Record<string, ReservationStatus> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ARRIVED: 'arrived',
  SEATED: 'seated',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
  // SR also uses these
  WAITLIST: 'waitlisted',
  'NOT RECONCILED': 'completed',
  LEFT: 'completed',
};

function mapSrStatus(srStatus: string): ReservationStatus {
  return SR_STATUS_MAP[srStatus?.toUpperCase()] || 'confirmed';
}

// ── Time Parsing ─────────────────────────────────────────────────

/**
 * Parse SR arrival_time ("7:00 PM" or "19:00:00") to TIME format "HH:MM".
 */
function parseSrTime(timeStr: string | null): string {
  if (!timeStr) return '19:00';

  // Already in HH:MM:SS format
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) {
    return timeStr.slice(0, 5);
  }

  // "7:00 PM" format
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let h = parseInt(match[1]);
    const m = match[2];
    if (match[3].toUpperCase() === 'PM' && h < 12) h += 12;
    if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  return '19:00';
}

// ── Sync Function ────────────────────────────────────────────────

export interface SyncResult {
  venueId: string;
  date: string;
  synced: number;
  errors: string[];
  duration_ms: number;
}

/**
 * Sync reservations from SevenRooms for a venue/date into the native table.
 */
export async function syncReservationsFromSR(
  kevaVenueId: string,
  orgId: string,
  date: string,
): Promise<SyncResult> {
  const t0 = Date.now();
  const result: SyncResult = {
    venueId: kevaVenueId,
    date,
    synced: 0,
    errors: [],
    duration_ms: 0,
  };

  const srVenueId = resolveSevenRoomsVenueId(kevaVenueId);
  if (!srVenueId) {
    result.errors.push('No SR venue ID mapped');
    result.duration_ms = Date.now() - t0;
    return result;
  }

  let srRezs: SevenRoomsReservation[];
  try {
    srRezs = await fetchReservationsForVenueDate(srVenueId, date);
  } catch (err: any) {
    result.errors.push(`SR API error: ${err.message}`);
    result.duration_ms = Date.now() - t0;
    return result;
  }

  for (const sr of srRezs) {
    try {
      const rez = await upsertReservation(orgId, kevaVenueId, {
        first_name: sr.first_name || '',
        last_name: sr.last_name || '',
        party_size: sr.max_guests || 2,
        business_date: date,
        arrival_time: parseSrTime(sr.arrival_time),
        seated_time: sr.seated_time || null,
        departed_time: sr.left_time || null,
        status: mapSrStatus(sr.status),
        channel: 'sevenrooms',
        external_id: sr.id,
        is_vip: sr.is_vip || false,
        tags: sr.tags?.map(t => t.tag) || [],
        notes: sr.notes || null,
        client_requests: sr.client_requests || null,
        min_spend: sr.min_price ?? null,
        booked_by: sr.booked_by || null,
        last_synced_at: new Date().toISOString(),
        sync_source: 'sevenrooms',
      });

      // Log sync event (only for new reservations — check created_at vs updated_at proximity)
      const createdMs = new Date(rez.created_at).getTime();
      const now = Date.now();
      if (now - createdMs < 5000) {
        await insertReservationEvent({
          reservation_id: rez.id,
          event_type: 'created',
          to_status: rez.status,
          actor_type: 'sync',
          metadata: { source: 'sevenrooms', sr_id: sr.id },
        });
      } else {
        await insertReservationEvent({
          reservation_id: rez.id,
          event_type: 'synced',
          actor_type: 'sync',
          metadata: { source: 'sevenrooms', sr_id: sr.id },
        });
      }

      result.synced++;
    } catch (err: any) {
      result.errors.push(`Rez ${sr.id}: ${err.message}`);
    }
  }

  result.duration_ms = Date.now() - t0;
  return result;
}
