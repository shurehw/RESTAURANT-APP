/**
 * Time Clock Kiosk Page
 * Tablet/iPad posted at restaurant entrance
 * Large buttons, camera verification, PIN entry
 */

import { TimeClockKiosk } from '@/components/timeclock/TimeClockKiosk';

export default function TimeClockPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-opsos-sage-50 to-opsos-brass-50">
      <TimeClockKiosk />
    </div>
  );
}
