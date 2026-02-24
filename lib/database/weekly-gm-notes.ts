/**
 * Weekly GM Notes — Data Access Layer
 *
 * CRUD for the structured GM context that feeds into the weekly
 * AI executive narrative. One row per venue per week.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface WeeklyGmNotes {
  id: string;
  venue_id: string;
  week_start: string;
  // Summary
  headline: string | null;
  revenue_context: string | null;
  // Guest Experience
  opentable_rating: number | null;
  google_rating: number | null;
  guest_compliments: string | null;
  guest_complaints: string | null;
  guest_action_items: string | null;
  // Team & Staffing
  staffing_notes: string | null;
  team_shoutout: string | null;
  // Enforcement
  comp_context: string | null;
  // Operations
  operations_notes: string | null;
  // Forward-Looking
  next_week_outlook: string | null;
  upcoming_events: string | null;
  // Meta
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GmNotesInput {
  headline?: string | null;
  revenue_context?: string | null;
  opentable_rating?: number | null;
  google_rating?: number | null;
  guest_compliments?: string | null;
  guest_complaints?: string | null;
  guest_action_items?: string | null;
  staffing_notes?: string | null;
  team_shoutout?: string | null;
  comp_context?: string | null;
  operations_notes?: string | null;
  next_week_outlook?: string | null;
  upcoming_events?: string | null;
}

// ══════════════════════════════════════════════════════════════════════════
// QUERIES
// ══════════════════════════════════════════════════════════════════════════

/** Fetch GM notes for a specific venue + week */
export async function getWeeklyGmNotes(
  venueId: string,
  weekStart: string,
): Promise<WeeklyGmNotes | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('weekly_gm_notes')
    .select('*')
    .eq('venue_id', venueId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (error) {
    console.error('[weekly-gm-notes] fetch error:', error);
    return null;
  }
  return data;
}

/** Upsert GM notes (insert or update) */
export async function upsertWeeklyGmNotes(
  venueId: string,
  weekStart: string,
  notes: GmNotesInput,
  submittedBy?: string,
): Promise<WeeklyGmNotes> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('weekly_gm_notes')
    .upsert(
      {
        venue_id: venueId,
        week_start: weekStart,
        ...notes,
        submitted_by: submittedBy ?? null,
      },
      { onConflict: 'venue_id,week_start' },
    )
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to save GM notes: ${error.message}`);
  }
  return data;
}
