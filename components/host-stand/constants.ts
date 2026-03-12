import type { TableState } from '@/lib/floor-management/table-state-machine';

export const STATE_COLORS: Record<TableState, string> = {
  available: '#10B981',
  reserved: '#3B82F6',
  seated: '#F59E0B',
  occupied: '#F97316',
  check_dropped: '#8B5CF6',
  bussing: '#EF4444',
  blocked: '#6B7280',
};

export const STATE_LABELS: Record<TableState, string> = {
  available: 'Available',
  reserved: 'Reserved',
  seated: 'Seated',
  occupied: 'Occupied',
  check_dropped: 'Check Dropped',
  bussing: 'Bussing',
  blocked: 'Blocked',
};

/**
 * Get the business date in LA timezone (before 5 AM = previous day).
 */
export function getBusinessDate(): string {
  // Use LA timezone — venues are in Pacific time
  const laDate = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const la = new Date(laDate);
  if (la.getHours() < 5) {
    la.setDate(la.getDate() - 1);
  }
  // Format as YYYY-MM-DD using locale-safe method
  const y = la.getFullYear();
  const m = String(la.getMonth() + 1).padStart(2, '0');
  const d = String(la.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
