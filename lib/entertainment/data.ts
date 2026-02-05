/**
 * Entertainment Schedule Data
 * Static data parsed from ENTERTAINMENT CALENDAR FINAL.xlsx
 * TODO: Migrate to Supabase tables
 */

import {
  VenueSchedule,
  ScheduleEntry,
  Artist,
  Rate,
  DayOfWeek,
  EntertainmentType,
} from './types';

// Venue IDs mapped to names
export const VENUE_ENTERTAINMENT_MAP: Record<string, string> = {
  'The Nice Guy': 'tng',
  'Delilah LA': 'delilah-la',
  'Delilah Miami': 'delilah-mia',
  'Delilah Dallas': 'delilah-dls',
};

// Static schedule data from Excel
export const ENTERTAINMENT_SCHEDULES: VenueSchedule[] = [
  // The Nice Guy
  {
    venue_id: 'tng',
    venue_name: 'The Nice Guy',
    schedule: [
      { venue_id: 'tng', day_of_week: 'Mon', entertainment_type: 'Band', time_slot_start: '19:00', time_slot_end: '21:00', config: 'DUO', notes: 'Martini Monday' },
      { venue_id: 'tng', day_of_week: 'Wed', entertainment_type: 'Band', time_slot_start: '19:30', time_slot_end: '21:30', config: 'DUO' },
      { venue_id: 'tng', day_of_week: 'Thu', entertainment_type: 'Band', time_slot_start: '19:30', time_slot_end: '21:30', config: 'SOLO' },
      { venue_id: 'tng', day_of_week: 'Fri', entertainment_type: 'Band', time_slot_start: '19:30', time_slot_end: '21:30', config: 'DUO' },
      { venue_id: 'tng', day_of_week: 'Fri', entertainment_type: 'DJ', time_slot_start: '22:00', time_slot_end: '00:00', config: 'DJ' },
      { venue_id: 'tng', day_of_week: 'Sat', entertainment_type: 'Band', time_slot_start: '19:30', time_slot_end: '21:30', config: 'DUO' },
      { venue_id: 'tng', day_of_week: 'Sat', entertainment_type: 'DJ', time_slot_start: '22:00', time_slot_end: '00:00', config: 'DJ' },
    ],
    artists: [
      { venue_id: 'tng', name: 'Nikki Bove', entertainment_type: 'Band', phone: '302 230 6831', is_coordinator: true },
    ],
    rates: [
      { venue_id: 'tng', entertainment_type: 'Band', description: 'Duo Martini Monday', amount: 600, is_flat_fee: true },
      { venue_id: 'tng', entertainment_type: 'Band', description: 'Solo Thu', amount: 200, is_flat_fee: true },
      { venue_id: 'tng', entertainment_type: 'Band', description: 'Duo Wed/Fri/Sat', amount: 350, is_flat_fee: true },
    ],
  },

  // Delilah LA
  {
    venue_id: 'delilah-la',
    venue_name: 'Delilah LA',
    schedule: [
      { venue_id: 'delilah-la', day_of_week: 'Tue', entertainment_type: 'Band', time_slot_start: '19:00', time_slot_end: '21:00', config: 'SOLO' },
      { venue_id: 'delilah-la', day_of_week: 'Wed', entertainment_type: 'Band', time_slot_start: '19:00', time_slot_end: '21:00', config: 'DUO' },
      { venue_id: 'delilah-la', day_of_week: 'Thu', entertainment_type: 'Band', time_slot_start: '19:30', time_slot_end: '21:30', config: '4 PIECE BAND' },
      { venue_id: 'delilah-la', day_of_week: 'Thu', entertainment_type: 'Dancers', time_slot_start: '19:30', time_slot_end: '21:30', config: '2 DANCERS' },
      { venue_id: 'delilah-la', day_of_week: 'Fri', entertainment_type: 'Band', time_slot_start: '19:00', time_slot_end: '20:00', config: 'SOLO' },
      { venue_id: 'delilah-la', day_of_week: 'Fri', entertainment_type: 'Band', time_slot_start: '21:00', time_slot_end: '23:00', config: '4 PIECE BAND' },
      { venue_id: 'delilah-la', day_of_week: 'Fri', entertainment_type: 'Dancers', time_slot_start: '21:00', time_slot_end: '23:00', config: '2 DANCERS' },
      { venue_id: 'delilah-la', day_of_week: 'Sat', entertainment_type: 'Band', time_slot_start: '19:00', time_slot_end: '20:00', config: 'SOLO' },
      { venue_id: 'delilah-la', day_of_week: 'Sat', entertainment_type: 'Band', time_slot_start: '21:00', time_slot_end: '23:00', config: '4 PIECE BAND' },
      { venue_id: 'delilah-la', day_of_week: 'Sat', entertainment_type: 'Dancers', time_slot_start: '21:00', time_slot_end: '23:00', config: '2 DANCERS' },
      { venue_id: 'delilah-la', day_of_week: 'Sun', entertainment_type: 'Band', time_slot_start: '19:00', time_slot_end: '20:00', config: 'SOLO' },
      { venue_id: 'delilah-la', day_of_week: 'Sun', entertainment_type: 'Band', time_slot_start: '22:00', time_slot_end: '00:00', config: '6 PIECE BAND', notes: 'Jazz Night' },
    ],
    artists: [
      { venue_id: 'delilah-la', name: 'Ryan Cross', entertainment_type: 'Band', phone: '213 923 1373', is_coordinator: true },
      { venue_id: 'delilah-la', name: 'Luciana Mancari', entertainment_type: 'Band', phone: '708 790 2392', is_coordinator: false, notes: 'Wednesday' },
      { venue_id: 'delilah-la', name: 'Joseph Dockery', entertainment_type: 'Band', phone: '630 877 7515', is_coordinator: false, notes: 'Wednesday' },
      { venue_id: 'delilah-la', name: 'Joany', entertainment_type: 'Dancers', phone: '310 902 8461', is_coordinator: true },
      { venue_id: 'delilah-la', name: 'Eskae', entertainment_type: 'DJ', phone: '213 675 4176', is_coordinator: true, notes: 'AV Tech' },
    ],
    rates: [
      { venue_id: 'delilah-la', entertainment_type: 'Band', description: '2 hr', amount: 250, is_flat_fee: true },
      { venue_id: 'delilah-la', entertainment_type: 'Band', description: '3 hr', amount: 300, is_flat_fee: true },
      { venue_id: 'delilah-la', entertainment_type: 'Band', description: '3.5 hr', amount: 350, is_flat_fee: true },
      { venue_id: 'delilah-la', entertainment_type: 'Band', description: '4 hr', amount: 400, is_flat_fee: true },
      { venue_id: 'delilah-la', entertainment_type: 'Band', description: 'Jazz Night', amount: 1700, is_flat_fee: true },
      { venue_id: 'delilah-la', entertainment_type: 'Dancers', description: 'Per Dancer', amount: 275, is_flat_fee: true },
    ],
  },

  // Delilah Miami
  {
    venue_id: 'delilah-mia',
    venue_name: 'Delilah Miami',
    schedule: [
      { venue_id: 'delilah-mia', day_of_week: 'Tue', entertainment_type: 'Band', time_slot_start: '19:00', time_slot_end: '21:00', config: 'SOLO' },
      { venue_id: 'delilah-mia', day_of_week: 'Wed', entertainment_type: 'Band', time_slot_start: '19:00', time_slot_end: '21:00', config: 'SOLO' },
      { venue_id: 'delilah-mia', day_of_week: 'Thu', entertainment_type: 'Band', time_slot_start: '19:30', time_slot_end: '21:30', config: '4 PIECE' },
      { venue_id: 'delilah-mia', day_of_week: 'Thu', entertainment_type: 'Dancers', time_slot_start: '20:30', time_slot_end: '23:00', config: '2 DANCERS', notes: '1 at 8:30 / 1 starting 9:30pm' },
      { venue_id: 'delilah-mia', day_of_week: 'Fri', entertainment_type: 'Band', time_slot_start: '19:00', time_slot_end: '21:00', config: '4 PIECE' },
      { venue_id: 'delilah-mia', day_of_week: 'Fri', entertainment_type: 'Dancers', time_slot_start: '20:30', time_slot_end: '23:00', config: '2 DANCERS', notes: '1 at 8:30 / 1 starting 9:30pm' },
      { venue_id: 'delilah-mia', day_of_week: 'Sat', entertainment_type: 'Band', time_slot_start: '19:00', time_slot_end: '21:00', config: '4 PIECE' },
      { venue_id: 'delilah-mia', day_of_week: 'Sat', entertainment_type: 'Dancers', time_slot_start: '20:30', time_slot_end: '23:00', config: '2 DANCERS', notes: '1 at 8:30 / 1 starting 9:30pm' },
      { venue_id: 'delilah-mia', day_of_week: 'Sun', entertainment_type: 'Band', time_slot_start: '19:00', time_slot_end: '20:00', config: 'DUO' },
      { venue_id: 'delilah-mia', day_of_week: 'Sun', entertainment_type: 'Band', time_slot_start: '21:00', time_slot_end: '23:00', config: '6 PIECE' },
      { venue_id: 'delilah-mia', day_of_week: 'Sun', entertainment_type: 'Dancers', time_slot_start: '19:30', time_slot_end: '23:00', config: '4 DANCERS', notes: '1 at 7:30pm / 3 starting 9:30pm' },
    ],
    artists: [
      { venue_id: 'delilah-mia', name: 'Ryan Cross', entertainment_type: 'Band', phone: '213 923 1373', is_coordinator: true },
      { venue_id: 'delilah-mia', name: 'Elena Lee', entertainment_type: 'Dancers', phone: '305 902 8500', is_coordinator: true },
      { venue_id: 'delilah-mia', name: 'Shane', entertainment_type: 'DJ', phone: '917 655 0313', is_coordinator: true, notes: 'AV Tech' },
    ],
    rates: [
      { venue_id: 'delilah-mia', entertainment_type: 'Band', description: '2 hr', amount: 225, is_flat_fee: true },
      { venue_id: 'delilah-mia', entertainment_type: 'Band', description: '3 hr', amount: 275, is_flat_fee: true },
      { venue_id: 'delilah-mia', entertainment_type: 'Band', description: '3.5 hr', amount: 325, is_flat_fee: true },
      { venue_id: 'delilah-mia', entertainment_type: 'Band', description: '4 hr', amount: 375, is_flat_fee: true },
      { venue_id: 'delilah-mia', entertainment_type: 'Band', description: 'Monthly Management', amount: 3000, is_flat_fee: true },
      { venue_id: 'delilah-mia', entertainment_type: 'Dancers', description: 'Per Dancer', amount: 400, is_flat_fee: true },
      { venue_id: 'delilah-mia', entertainment_type: 'Dancers', description: 'Weekly Coordinating', amount: 250, is_flat_fee: true },
      { venue_id: 'delilah-mia', entertainment_type: 'DJ', description: 'AV Tech/Night', amount: 300, is_flat_fee: true },
    ],
  },

  // Delilah Dallas
  {
    venue_id: 'delilah-dls',
    venue_name: 'Delilah Dallas',
    schedule: [
      { venue_id: 'delilah-dls', day_of_week: 'Tue', entertainment_type: 'Band', time_slot_start: '18:00', time_slot_end: '20:00', config: 'TRIO' },
      { venue_id: 'delilah-dls', day_of_week: 'Tue', entertainment_type: 'Band', time_slot_start: '20:30', time_slot_end: '22:30', config: 'QUARTET', notes: 'After turnover' },
      { venue_id: 'delilah-dls', day_of_week: 'Tue', entertainment_type: 'Dancers', time_slot_start: '18:00', time_slot_end: '22:00', config: '4 DANCERS', notes: 'Staggered' },
      { venue_id: 'delilah-dls', day_of_week: 'Wed', entertainment_type: 'Band', time_slot_start: '18:00', time_slot_end: '20:00', config: 'TRIO' },
      { venue_id: 'delilah-dls', day_of_week: 'Wed', entertainment_type: 'Band', time_slot_start: '20:30', time_slot_end: '22:30', config: 'QUARTET', notes: 'After turnover' },
      { venue_id: 'delilah-dls', day_of_week: 'Wed', entertainment_type: 'Dancers', time_slot_start: '18:00', time_slot_end: '22:00', config: '4 DANCERS', notes: 'Staggered' },
      { venue_id: 'delilah-dls', day_of_week: 'Thu', entertainment_type: 'Band', time_slot_start: '18:00', time_slot_end: '20:00', config: 'TRIO' },
      { venue_id: 'delilah-dls', day_of_week: 'Thu', entertainment_type: 'Band', time_slot_start: '20:30', time_slot_end: '22:30', config: 'QUARTET', notes: 'After turnover' },
      { venue_id: 'delilah-dls', day_of_week: 'Thu', entertainment_type: 'Dancers', time_slot_start: '18:00', time_slot_end: '22:00', config: '4 DANCERS', notes: 'Staggered' },
      { venue_id: 'delilah-dls', day_of_week: 'Fri', entertainment_type: 'Band', time_slot_start: '18:00', time_slot_end: '20:00', config: 'TRIO' },
      { venue_id: 'delilah-dls', day_of_week: 'Fri', entertainment_type: 'Band', time_slot_start: '20:30', time_slot_end: '22:30', config: 'QUARTET', notes: 'After turnover' },
      { venue_id: 'delilah-dls', day_of_week: 'Fri', entertainment_type: 'Dancers', time_slot_start: '18:00', time_slot_end: '22:00', config: '4 DANCERS', notes: 'Staggered' },
      { venue_id: 'delilah-dls', day_of_week: 'Sat', entertainment_type: 'Band', time_slot_start: '18:00', time_slot_end: '20:00', config: 'TRIO' },
      { venue_id: 'delilah-dls', day_of_week: 'Sat', entertainment_type: 'Band', time_slot_start: '20:30', time_slot_end: '22:30', config: 'QUARTET', notes: 'After turnover' },
      { venue_id: 'delilah-dls', day_of_week: 'Sat', entertainment_type: 'Dancers', time_slot_start: '18:00', time_slot_end: '22:00', config: '4 DANCERS', notes: 'Staggered' },
      { venue_id: 'delilah-dls', day_of_week: 'Sun', entertainment_type: 'Band', time_slot_start: '18:00', time_slot_end: '20:00', config: 'TRIO' },
      { venue_id: 'delilah-dls', day_of_week: 'Sun', entertainment_type: 'Band', time_slot_start: '20:30', time_slot_end: '22:30', config: 'QUARTET', notes: 'After turnover' },
      { venue_id: 'delilah-dls', day_of_week: 'Sun', entertainment_type: 'Dancers', time_slot_start: '18:00', time_slot_end: '22:00', config: '4 DANCERS', notes: 'Staggered' },
    ],
    artists: [
      { venue_id: 'delilah-dls', name: 'Ryan Cross', entertainment_type: 'Band', phone: '213 923 1373', is_coordinator: true },
      { venue_id: 'delilah-dls', name: 'Joany', entertainment_type: 'Dancers', phone: '310 902 8461', is_coordinator: true },
      { venue_id: 'delilah-dls', name: 'Diana', entertainment_type: 'Dancers', phone: '940 256 0447', is_coordinator: false },
      { venue_id: 'delilah-dls', name: 'Dilly', entertainment_type: 'DJ', phone: '972 896 6435', is_coordinator: true },
      { venue_id: 'delilah-dls', name: 'Garett', entertainment_type: 'DJ', phone: '940 300 0866', is_coordinator: false, notes: 'AV Tech' },
    ],
    rates: [
      { venue_id: 'delilah-dls', entertainment_type: 'Band', description: '2 hr', amount: 250, is_flat_fee: true },
      { venue_id: 'delilah-dls', entertainment_type: 'Band', description: '3 hr', amount: 300, is_flat_fee: true },
      { venue_id: 'delilah-dls', entertainment_type: 'Band', description: '3.5 hr', amount: 350, is_flat_fee: true },
      { venue_id: 'delilah-dls', entertainment_type: 'Band', description: '4 hr', amount: 400, is_flat_fee: true },
      { venue_id: 'delilah-dls', entertainment_type: 'Dancers', description: 'Per Dancer', amount: 275, is_flat_fee: true },
      { venue_id: 'delilah-dls', entertainment_type: 'DJ', description: 'Per Night', amount: 400, is_flat_fee: true },
    ],
  },
];

export function getScheduleForVenue(venueId: string): VenueSchedule | undefined {
  return ENTERTAINMENT_SCHEDULES.find((s) => s.venue_id === venueId);
}

export function getScheduleByVenueName(venueName: string): VenueSchedule | undefined {
  const venueId = VENUE_ENTERTAINMENT_MAP[venueName];
  if (!venueId) return undefined;
  return getScheduleForVenue(venueId);
}

export function getAllVenueSchedules(): VenueSchedule[] {
  return ENTERTAINMENT_SCHEDULES;
}
