/**
 * lib/database/service-notes.ts
 * Data access layer for host stand service & guest notes.
 * Pattern: lib/database/floor-management.ts
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ────────────────────────────────────────────────────────

export interface ServiceNote {
  id: string;
  org_id: string;
  venue_id: string;
  business_date: string;
  table_id: string | null;
  reservation_id: string | null;
  note_type: 'service' | 'guest';
  note_text: string;
  sr_write_status: 'pending' | 'success' | 'failed' | 'unsupported' | null;
  sr_error: string | null;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}

// ── Create ───────────────────────────────────────────────────────

export async function createServiceNote(
  orgId: string,
  venueId: string,
  data: {
    business_date: string;
    table_id?: string;
    reservation_id?: string;
    note_type: 'service' | 'guest';
    note_text: string;
    author_id?: string;
    author_name?: string;
    sr_write_status?: string;
    sr_error?: string;
  },
): Promise<ServiceNote> {
  const supabase = getServiceClient();
  // Table not yet in generated types — cast through any
  const { data: note, error } = await (supabase as any)
    .from('service_notes')
    .insert({
      org_id: orgId,
      venue_id: venueId,
      business_date: data.business_date,
      table_id: data.table_id || null,
      reservation_id: data.reservation_id || null,
      note_type: data.note_type,
      note_text: data.note_text,
      author_id: data.author_id || null,
      author_name: data.author_name || null,
      sr_write_status: data.sr_write_status || null,
      sr_error: data.sr_error || null,
    })
    .select()
    .single();

  if (error) throw error;
  return note as ServiceNote;
}

// ── Read ─────────────────────────────────────────────────────────

export async function getServiceNotesForVenueDate(
  venueId: string,
  date: string,
  filters?: { table_id?: string; reservation_id?: string },
): Promise<ServiceNote[]> {
  const supabase = getServiceClient();
  // Table not yet in generated types — cast through any
  let query = (supabase as any)
    .from('service_notes')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .order('created_at', { ascending: false });

  if (filters?.table_id) {
    query = query.eq('table_id', filters.table_id);
  }
  if (filters?.reservation_id) {
    query = query.eq('reservation_id', filters.reservation_id);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[service-notes] Failed to fetch:', error.message);
    return [];
  }
  return (data || []) as ServiceNote[];
}

export async function getServiceNotesForReservation(
  reservationId: string,
): Promise<ServiceNote[]> {
  const supabase = getServiceClient();
  // Table not yet in generated types — cast through any
  const { data, error } = await (supabase as any)
    .from('service_notes')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[service-notes] Failed to fetch by rez:', error.message);
    return [];
  }
  return (data || []) as ServiceNote[];
}
