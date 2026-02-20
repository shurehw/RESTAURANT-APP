/**
 * Entertainment Schedule Types
 * For managing live music, DJs, and dancers
 */

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type EntertainmentType = 'Band' | 'Dancers' | 'DJ' | 'AV';

export type PerformanceConfig =
  | 'SOLO'
  | 'DUO'
  | 'TRIO'
  | 'QUARTET'
  | '4 PIECE'
  | '4 PIECE BAND'
  | '6 PIECE'
  | '6 PIECE BAND'
  | string; // Allow custom configs

export interface TimeSlot {
  start: string; // e.g., "18:00"
  end: string;   // e.g., "18:30"
  label: string; // e.g., "6 - 6:30"
}

export interface ScheduleEntry {
  id?: string;
  venue_id: string;
  day_of_week: DayOfWeek;
  entertainment_type: EntertainmentType;
  time_slot_start: string; // e.g., "19:00"
  time_slot_end: string;   // e.g., "21:00"
  config: PerformanceConfig; // e.g., "DUO", "4 PIECE BAND"
  performer_name?: string; // Artist/performer name if assigned
  booked_by?: string; // Who made the booking
  rate_amount?: number; // Cost for this entertainment entry
  notes?: string;
}

export type CrowdEnergy = 'low' | 'moderate' | 'high' | 'exceptional';

export interface TypeFeedback {
  rating?: number;
  notes?: string;
  performer?: string;
  would_rebook?: boolean;
}

export interface ShiftLog {
  id?: string;
  venue_id: string;
  business_date: string;
  overall_rating?: number; // 1-5
  crowd_energy?: CrowdEnergy;
  entertainment_feedback?: string;
  would_rebook?: boolean;
  type_feedback?: Record<EntertainmentType, TypeFeedback>;
  total_entertainment_cost?: number;
  actual_sales?: number;
  entertainment_pct?: number;
  submitted_by?: string;
  submitted_at?: string;
}

export interface Artist {
  id?: string;
  venue_id: string;
  name: string;
  entertainment_type: EntertainmentType;
  phone?: string;
  email?: string;
  standard_rate?: number;
  is_coordinator: boolean; // true if they manage others (like Ryan Cross)
  notes?: string;
}

export interface Rate {
  id?: string;
  venue_id: string;
  artist_id?: string;
  entertainment_type: EntertainmentType;
  description: string; // e.g., "2 hr", "3 hr", "per dancer"
  amount: number;
  is_flat_fee: boolean; // true for flat rates, false for hourly/per-unit
}

export interface VenueSchedule {
  venue_id: string;
  venue_name: string;
  schedule: ScheduleEntry[];
  artists: Artist[];
  rates: Rate[];
}

// Time slots used in the calendar (30-min increments)
export const TIME_SLOTS: TimeSlot[] = [
  { start: '17:00', end: '17:30', label: '5 - 5:30' },
  { start: '17:30', end: '18:00', label: '5:30 - 6' },
  { start: '18:00', end: '18:30', label: '6 - 6:30' },
  { start: '18:30', end: '19:00', label: '6:30 - 7' },
  { start: '19:00', end: '19:30', label: '7 - 7:30' },
  { start: '19:30', end: '20:00', label: '7:30 - 8' },
  { start: '20:00', end: '20:30', label: '8 - 8:30' },
  { start: '20:30', end: '21:00', label: '8:30 - 9' },
  { start: '21:00', end: '21:30', label: '9 - 9:30' },
  { start: '21:30', end: '22:00', label: '9:30 - 10' },
  { start: '22:00', end: '22:30', label: '10 - 10:30' },
  { start: '22:30', end: '23:00', label: '10:30 - 11' },
  { start: '23:00', end: '23:30', label: '11 - 11:30' },
  { start: '23:30', end: '00:00', label: '11:30 - 12' },
];

export const DAYS_OF_WEEK: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const ENTERTAINMENT_TYPES: EntertainmentType[] = ['Band', 'Dancers', 'DJ', 'AV'];

export const PERFORMANCE_CONFIGS: PerformanceConfig[] = [
  'SOLO',
  'DUO',
  'TRIO',
  'QUARTET',
  '4 PIECE',
  '4 PIECE BAND',
  '6 PIECE',
  '6 PIECE BAND',
];
