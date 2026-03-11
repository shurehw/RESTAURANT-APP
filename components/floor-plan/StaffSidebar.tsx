'use client';

import { Input } from '@/components/ui/input';
import { RefreshCw, Plus } from 'lucide-react';
import type { ShiftTableSplit, VenueTable } from '@/lib/database/floor-plan';

interface StaffMember {
  employee_id: string;
  employee_name: string;
  position_name: string;
}

const SHIFT_OPTIONS = [
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'late_night', label: 'Late Night' },
  { value: 'breakfast', label: 'Breakfast' },
];

interface StaffSidebarProps {
  splits: ShiftTableSplit[];
  unassigned: StaffMember[];
  tables: VenueTable[];
  onResplit: () => void;
  onRemoveSplit: (splitId: string) => void;
  onHighlightTables: (tableIds: string[]) => void;
  date: string;
  onDateChange: (date: string) => void;
  shiftType: string;
  onShiftTypeChange: (shift: string) => void;
  loading: boolean;
  resplitting: boolean;
}

export function StaffSidebar({
  splits,
  unassigned,
  tables,
  onResplit,
  onRemoveSplit,
  onHighlightTables,
  date,
  onDateChange,
  shiftType,
  onShiftTypeChange,
  loading,
  resplitting,
}: StaffSidebarProps) {
  // Build a lookup: table_id → table_number
  const tableNumMap = new Map(tables.map((t) => [t.id, t.table_number]));
  // Build a lookup: table_id → max_capacity
  const tableCapMap = new Map(tables.map((t) => [t.id, t.max_capacity]));

  return (
    <div className="w-72 border-l bg-white flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-gray-800">Staff Sections</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Auto-split by scheduled servers
        </p>
      </div>

      {/* Date + shift picker */}
      <div className="px-3 py-2 border-b flex gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="flex-1 text-xs h-8"
        />
        <select
          value={shiftType}
          onChange={(e) => onShiftTypeChange(e.target.value)}
          className="px-2 py-1 border rounded-md text-xs"
        >
          {SHIFT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-4">Loading schedule...</p>
        ) : (
          <>
            {/* Server cards */}
            {splits.map((split) => {
              const tableNums = split.table_ids
                .map((id) => tableNumMap.get(id) || '?')
                .sort((a, b) => {
                  const na = parseInt(a, 10);
                  const nb = parseInt(b, 10);
                  if (!isNaN(na) && !isNaN(nb)) return na - nb;
                  return a.localeCompare(b);
                });
              const totalCovers = split.table_ids.reduce(
                (sum, id) => sum + (tableCapMap.get(id) || 0),
                0,
              );

              return (
                <div
                  key={split.id}
                  className="rounded-lg border bg-gray-50 overflow-hidden"
                  onMouseEnter={() => onHighlightTables(split.table_ids)}
                  onMouseLeave={() => onHighlightTables([])}
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: split.section_color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {split.employee_name || 'Unknown'}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {split.position_name || 'Server'}
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveSplit(split.id)}
                      className="text-gray-400 hover:text-red-500 text-xs"
                      title="Remove assignment"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="px-3 pb-2">
                    <div className="text-[11px] text-gray-600">
                      Tables:{' '}
                      <span className="font-medium text-gray-800">
                        {tableNums.join(', ')}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {split.table_ids.length} tables &middot; {totalCovers} covers
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Unassigned staff */}
            {unassigned.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Unassigned ({unassigned.length})
                </h4>
                <div className="space-y-1.5">
                  {unassigned.map((s) => (
                    <div
                      key={s.employee_id}
                      className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-gray-300 bg-white"
                    >
                      <div className="w-3 h-3 rounded-full bg-gray-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700 truncate">{s.employee_name}</div>
                        <div className="text-[11px] text-gray-400">{s.position_name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {splits.length === 0 && unassigned.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No scheduled FOH staff for this shift
              </p>
            )}
          </>
        )}
      </div>

      {/* Bottom actions */}
      <div className="px-3 py-2 border-t flex gap-2">
        <button
          onClick={onResplit}
          disabled={resplitting || loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium
            bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${resplitting ? 'animate-spin' : ''}`} />
          Re-Split
        </button>
      </div>
    </div>
  );
}
