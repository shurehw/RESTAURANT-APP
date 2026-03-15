'use client';

import { useState, useEffect, useCallback } from 'react';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import { StaffSidebar } from './StaffSidebar';
import type { VenueTable, VenueSection, VenueLabel, FloorPlan, ShiftTableSplit } from '@/lib/database/floor-plan';

interface FloorPlanOpsProps {
  venues: { id: string; name: string }[];
  initialVenueId: string;
}

export function FloorPlanOps({ venues, initialVenueId }: FloorPlanOpsProps) {
  // ── State ──────────────────────────────────────────────────────
  const [venueId, setVenueId] = useState(initialVenueId);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftType, setShiftType] = useState('dinner');

  const [sections, setSections] = useState<VenueSection[]>([]);
  const [tables, setTables] = useState<VenueTable[]>([]);
  const [labels, setLabels] = useState<VenueLabel[]>([]);
  const [splits, setSplits] = useState<ShiftTableSplit[]>([]);
  const [unassigned, setUnassigned] = useState<{ employee_id: string; employee_name: string; position_name: string }[]>([]);
  const [highlightedTableIds, setHighlightedTableIds] = useState<Set<string>>(new Set());
  const [resplitting, setResplitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [staffLoading, setStaffLoading] = useState(false);

  // ── Data Loading ───────────────────────────────────────────────
  const loadFloorPlan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/floor-plan?venue_id=${venueId}`);
      if (!res.ok) throw new Error('Failed to load floor plan');
      const data: FloorPlan = await res.json();
      setSections(data.sections);
      setTables(data.tables);
      setLabels(data.labels || []);
    } catch (err) {
      console.error('[floor-plan] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  const loadShiftSplits = useCallback(async () => {
    setStaffLoading(true);
    try {
      const res = await fetch(
        `/api/floor-plan/assignments?venue_id=${venueId}&date=${date}&shift_type=${shiftType}`,
      );
      if (!res.ok) throw new Error('Failed to load staff');
      const data = await res.json();
      setSplits(data.splits || []);
      setUnassigned(data.unassigned || []);
    } catch (err) {
      console.error('[floor-plan] Staff load error:', err);
    } finally {
      setStaffLoading(false);
    }
  }, [venueId, date, shiftType]);

  useEffect(() => {
    loadFloorPlan();
  }, [loadFloorPlan]);

  // Load staff splits once floor plan is loaded
  useEffect(() => {
    if (!loading) {
      loadShiftSplits();
    }
  }, [loading, loadShiftSplits]);

  // ── Split Handlers ─────────────────────────────────────────────
  const handleResplit = async () => {
    setResplitting(true);
    try {
      const res = await fetch('/api/floor-plan/assignments/resplit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          business_date: date,
          shift_type: shiftType,
        }),
      });
      if (!res.ok) throw new Error('Failed to re-split');
      const data = await res.json();
      setSplits(data.splits || []);
      setUnassigned(data.unassigned || []);
    } catch (err) {
      console.error('[floor-plan] Resplit error:', err);
    } finally {
      setResplitting(false);
    }
  };

  const handleRemoveSplit = async (splitId: string) => {
    try {
      await fetch(`/api/floor-plan/assignments?id=${splitId}`, { method: 'DELETE' });
      await loadShiftSplits();
    } catch (err) {
      console.error('[floor-plan] Remove split error:', err);
    }
  };

  const handleVenueChange = (id: string) => {
    setVenueId(id);
    window.history.replaceState(null, '', `?venue=${id}`);
  };

  // ── Table color map from splits ────────────────────────────────
  const tableColorMap = new Map<string, string>();
  for (const split of splits) {
    for (const tid of split.table_ids) {
      tableColorMap.set(tid, split.section_color);
    }
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header with venue selector */}
      <div className="flex items-center bg-white border-b px-4 py-2">
        <h2 className="text-sm font-semibold text-gray-700 mr-4">Floor Plan</h2>
        {venues.length > 1 && (
          <select
            value={venueId}
            onChange={(e) => handleVenueChange(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm"
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas — read-only, no editing */}
        <div className="flex-1 p-4 overflow-auto bg-gray-900">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              Loading floor plan...
            </div>
          ) : (
            <FloorPlanCanvas
              tables={tables}
              sections={sections}
              labels={labels}
              selectedTableIds={new Set()}
              highlightedTableIds={highlightedTableIds}
              tableColorMap={tableColorMap}
              onSelectTable={() => {}}
              onDeselectAll={() => {}}
              onDoubleClickTable={() => {}}
              readOnly={true}
            />
          )}
        </div>

        {/* Staff sidebar — always visible */}
        <StaffSidebar
          splits={splits}
          unassigned={unassigned}
          tables={tables}
          onResplit={handleResplit}
          onRemoveSplit={handleRemoveSplit}
          onHighlightTables={(ids) => setHighlightedTableIds(new Set(ids))}
          date={date}
          onDateChange={setDate}
          shiftType={shiftType}
          onShiftTypeChange={setShiftType}
          loading={staffLoading}
          resplitting={resplitting}
        />
      </div>
    </div>
  );
}
