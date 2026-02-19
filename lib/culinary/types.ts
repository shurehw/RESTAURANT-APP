/**
 * Culinary Shift Log Types
 * For tracking nightly kitchen/BOH performance
 */

export interface CulinaryShiftLog {
  id?: string;
  organization_id?: string;
  venue_id: string;
  business_date: string;

  // 86'd items (array of item names that ran out)
  eightysixed_items: string[];

  // Specials performance
  specials_notes?: string;

  // Kitchen operations
  equipment_issues?: string;
  prep_notes?: string;
  waste_notes?: string;
  vendor_issues?: string;

  // Overall assessment
  overall_rating?: number; // 1-5
  general_notes?: string;

  // Metadata
  submitted_by?: string;
  submitted_at?: string;
  updated_at?: string;
}
