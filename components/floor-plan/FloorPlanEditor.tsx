'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Pencil, Users } from 'lucide-react';
import { FloorPlanToolbar } from './FloorPlanToolbar';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import { StaffSidebar } from './StaffSidebar';
import { TableDialog } from './TableDialog';
import { SectionManager } from './SectionManager';
import { LabelDialog } from './LabelDialog';
import { getDefaultTableSize } from './TableShape';
import type { VenueTable, VenueSection, VenueLabel, FloorPlan, ShiftTableSplit } from '@/lib/database/floor-plan';

type EditorMode = 'layout' | 'staff';

interface FloorPlanEditorProps {
  venues: { id: string; name: string }[];
  initialVenueId: string;
}

export function FloorPlanEditor({ venues, initialVenueId }: FloorPlanEditorProps) {
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

  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(new Set());
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<VenueTable | null>(null);
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<VenueLabel | null>(null);
  const [srSeatingAreas, setSrSeatingAreas] = useState<string[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(false);

  const [mode, setMode] = useState<EditorMode>('layout');
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [staffLoading, setStaffLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [staffLoaded, setStaffLoaded] = useState(false);

  // Track original state for dirty detection
  const originalTablesRef = useRef<string>('');
  const originalLabelsRef = useRef<string>('');
  // Resize baseline — stores the table state at resize start
  const resizeBaseRef = useRef<VenueTable | null>(null);

  // ── DnD Sensors ────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

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
      originalTablesRef.current = JSON.stringify(data.tables);
      originalLabelsRef.current = JSON.stringify(data.labels || []);
      setHasChanges(false);
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

  // Only load staff when in staff mode (lazy load)
  useEffect(() => {
    if (mode === 'staff' && !loading) {
      loadShiftSplits();
      setStaffLoaded(true);
    }
  }, [mode, date, shiftType, loading, loadShiftSplits]);

  // Load SR seating areas for the section manager
  useEffect(() => {
    fetch(`/api/sales/reservations?venue_id=${venueId}&date=${date}&seating_areas_only=true`)
      .then((r) => r.json())
      .then((d) => setSrSeatingAreas(d.seating_areas || []))
      .catch(() => setSrSeatingAreas([]));
  }, [venueId, date]);

  // ── Dirty tracking ───────────────────────────────────────────
  useEffect(() => {
    const tablesChanged = originalTablesRef.current && JSON.stringify(tables) !== originalTablesRef.current;
    const labelsChanged = originalLabelsRef.current && JSON.stringify(labels) !== originalLabelsRef.current;
    if (tablesChanged || labelsChanged) {
      setHasChanges(true);
    }
  }, [tables, labels]);

  // ── Keyboard: Delete + Arrow keys ──────────────────────────
  useEffect(() => {
    if (mode !== 'layout') return;
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      // Escape — deselect all
      if (e.key === 'Escape') {
        setSelectedTableIds(new Set());
        return;
      }

      if (selectedTableIds.size === 0) return;

      // Delete / Backspace — delete all selected tables
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const ids = [...selectedTableIds];
        if (!confirm(`Delete ${ids.length === 1 ? 'this table' : `${ids.length} tables`}?`)) return;
        ids.forEach((id) => {
          fetch(`/api/floor-plan/tables?id=${id}`, { method: 'DELETE' }).catch(() => {});
        });
        setSelectedTableIds(new Set());
        loadFloorPlan();
        return;
      }

      // Arrow keys — nudge selected tables
      const NUDGE = e.shiftKey ? 2.5 : 0.5; // shift = bigger steps
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -NUDGE;
      else if (e.key === 'ArrowRight') dx = NUDGE;
      else if (e.key === 'ArrowUp') dy = -NUDGE;
      else if (e.key === 'ArrowDown') dy = NUDGE;
      else return;

      e.preventDefault();
      setTables((prev) =>
        prev.map((t) => {
          if (!selectedTableIds.has(t.id)) return t;
          let newX = t.pos_x + dx;
          let newY = t.pos_y + dy;
          if (snapEnabled) {
            newX = Math.round(newX / 2.5) * 2.5;
            newY = Math.round(newY / 2.5) * 2.5;
          }
          return {
            ...t,
            pos_x: Math.max(0, Math.min(100 - t.width, newX)),
            pos_y: Math.max(0, Math.min(100 - t.height, newY)),
          };
        }),
      );
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedTableIds, snapEnabled]);

  // ── Snap helper ──────────────────────────────────────────────
  const snap = (val: number, grid: number) => Math.round(val / grid) * grid;

  // ── Drag Handlers ──────────────────────────────────────────────
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, delta } = event;
      const activeData = active.data.current;

      if (!activeData) return;

      // Table dragged on canvas → update position (all selected move together)
      if (activeData.type === 'table') {
        const table = activeData.table as VenueTable;

        const container = document.querySelector('[style*="aspect-ratio"]');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const dxPct = (delta.x / rect.width) * 100;
        const dyPct = (delta.y / rect.height) * 100;

        // If the dragged table is selected, move all selected tables
        const movingIds = selectedTableIds.has(table.id)
          ? selectedTableIds
          : new Set([table.id]);

        setTables((prev) =>
          prev.map((t) => {
            if (!movingIds.has(t.id)) return t;
            let newX = t.pos_x + dxPct;
            let newY = t.pos_y + dyPct;
            if (snapEnabled) {
              newX = snap(newX, 2.5);
              newY = snap(newY, 2.5);
            }
            return {
              ...t,
              pos_x: Math.max(0, Math.min(100 - t.width, newX)),
              pos_y: Math.max(0, Math.min(100 - t.height, newY)),
            };
          }),
        );
        return;
      }

      // Label dragged on canvas → update position
      if (activeData.type === 'label') {
        const label = activeData.label as VenueLabel;
        const container = document.querySelector('[style*="aspect-ratio"]');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const dxPct = (delta.x / rect.width) * 100;
        const dyPct = (delta.y / rect.height) * 100;

        setLabels((prev) =>
          prev.map((l) =>
            l.id === label.id
              ? {
                  ...l,
                  pos_x: Math.max(0, Math.min(95, l.pos_x + dxPct)),
                  pos_y: Math.max(0, Math.min(95, l.pos_y + dyPct)),
                }
              : l,
          ),
        );
        return;
      }

    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapEnabled, selectedTableIds],
  );

  // ── Resize Handler ─────────────────────────────────────────────
  const handleTableResize = useCallback(
    (tableId: string, dw: number, dh: number, dx: number, dy: number) => {
      setTables((prev) =>
        prev.map((t) => {
          if (t.id !== tableId) return t;

          // On first resize call, store the base state
          if (!resizeBaseRef.current || resizeBaseRef.current.id !== tableId) {
            resizeBaseRef.current = { ...t };
          }
          const base = resizeBaseRef.current;

          const newW = Math.max(2, Math.min(25, base.width + dw));
          const newH = Math.max(2, Math.min(25, base.height + dh));
          const newX = Math.max(0, Math.min(100 - newW, base.pos_x + dx));
          const newY = Math.max(0, Math.min(100 - newH, base.pos_y + dy));

          return { ...t, width: newW, height: newH, pos_x: newX, pos_y: newY };
        }),
      );
    },
    [],
  );

  // ── CRUD Handlers ──────────────────────────────────────────────
  const handleSaveLayout = async () => {
    setSaving(true);
    try {
      // Save table positions
      const tableUpdates = tables.map((t) => ({
        id: t.id,
        pos_x: t.pos_x,
        pos_y: t.pos_y,
        width: t.width,
        height: t.height,
        rotation: t.rotation,
        section_id: t.section_id,
      }));

      const res = await fetch('/api/floor-plan/tables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId, updates: tableUpdates }),
      });
      if (!res.ok) throw new Error('Failed to save tables');

      // Save label positions
      if (labels.length > 0) {
        const labelUpdates = labels.map((l) => ({
          id: l.id,
          pos_x: l.pos_x,
          pos_y: l.pos_y,
        }));
        await fetch('/api/floor-plan/labels', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ venue_id: venueId, updates: labelUpdates }),
        });
      }

      originalTablesRef.current = JSON.stringify(tables);
      originalLabelsRef.current = JSON.stringify(labels);
      setHasChanges(false);
    } catch (err) {
      console.error('[floor-plan] Save error:', err);
      alert('Failed to save floor plan layout');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalTablesRef.current) {
      setTables(JSON.parse(originalTablesRef.current));
    }
    if (originalLabelsRef.current) {
      setLabels(JSON.parse(originalLabelsRef.current));
    }
    setHasChanges(false);
  };

  const handleAddTable = () => {
    setEditingTable(null);
    setTableDialogOpen(true);
  };

  const handleEditTable = (table: VenueTable) => {
    setEditingTable(table);
    setTableDialogOpen(true);
  };

  const handleSaveTable = async (data: {
    table_number: string;
    min_capacity: number;
    max_capacity: number;
    shape: string;
    section_id: string | null;
  }) => {
    try {
      // Compute default size for new tables based on shape/capacity
      const defaultSize = editingTable
        ? {}
        : getDefaultTableSize(data.shape as VenueTable['shape'], data.max_capacity);

      const body = {
        venue_id: venueId,
        ...(editingTable ? { id: editingTable.id } : {}),
        ...data,
        ...(editingTable
          ? {}
          : {
              pos_x: 45 + Math.random() * 10,
              pos_y: 45 + Math.random() * 10,
              ...defaultSize,
            }),
      };

      const res = await fetch('/api/floor-plan/tables', {
        method: editingTable ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to save table');
      await loadFloorPlan();
    } catch (err) {
      console.error('[floor-plan] Table save error:', err);
      alert('Failed to save table');
    }
  };

  const handleDeleteTable = async (id: string) => {
    if (!confirm('Delete this table?')) return;
    try {
      await fetch(`/api/floor-plan/tables?id=${id}`, { method: 'DELETE' });
      await loadFloorPlan();
    } catch (err) {
      console.error('[floor-plan] Table delete error:', err);
    }
  };

  const handleSaveSection = async (section: {
    id?: string;
    name: string;
    color: string;
    sr_seating_area: string | null;
    sort_order: number;
  }) => {
    try {
      const res = await fetch('/api/floor-plan/sections', {
        method: section.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId, ...section }),
      });
      if (!res.ok) throw new Error('Failed to save section');
      await loadFloorPlan();
    } catch (err) {
      console.error('[floor-plan] Section save error:', err);
    }
  };

  const handleDeleteSection = async (id: string) => {
    try {
      await fetch(`/api/floor-plan/sections?id=${id}`, { method: 'DELETE' });
      await loadFloorPlan();
    } catch (err) {
      console.error('[floor-plan] Section delete error:', err);
    }
  };

  // ── Label Handlers ─────────────────────────────────────────────
  const handleAddLabel = () => {
    setEditingLabel(null);
    setLabelDialogOpen(true);
  };

  const handleEditLabel = (label: VenueLabel) => {
    setEditingLabel(label);
    setLabelDialogOpen(true);
  };

  const handleSaveLabel = async (data: {
    text: string;
    font_size: number;
    color: string;
  }) => {
    try {
      const body = {
        venue_id: venueId,
        ...(editingLabel ? { id: editingLabel.id } : {}),
        ...data,
        ...(editingLabel
          ? {}
          : { pos_x: 45 + Math.random() * 10, pos_y: 45 + Math.random() * 10 }),
      };

      const res = await fetch('/api/floor-plan/labels', {
        method: editingLabel ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save label');
      await loadFloorPlan();
    } catch (err) {
      console.error('[floor-plan] Label save error:', err);
      alert('Failed to save label');
    }
  };

  const handleDeleteLabel = async (id: string) => {
    try {
      await fetch(`/api/floor-plan/labels?id=${id}`, { method: 'DELETE' });
      await loadFloorPlan();
    } catch (err) {
      console.error('[floor-plan] Label delete error:', err);
    }
  };

  // ── SR Import ──────────────────────────────────────────────────
  const handleImportSr = async () => {
    if (!confirm('Import tables from SevenRooms reservation history? This will add any tables not already on the floor plan.')) return;
    setImporting(true);
    try {
      const res = await fetch('/api/floor-plan/import-sr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Import failed');
        return;
      }
      alert(data.message || `Imported ${data.imported} tables`);
      if (data.imported > 0) await loadFloorPlan();
    } catch (err) {
      console.error('[floor-plan] Import error:', err);
      alert('Failed to import tables from SevenRooms');
    } finally {
      setImporting(false);
    }
  };

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

  // ── Render ─────────────────────────────────────────────────────
  const isLayout = mode === 'layout';

  // Build table → color map from splits for staff mode canvas coloring
  const tableColorMap = new Map<string, string>();
  if (!isLayout) {
    for (const split of splits) {
      for (const tid of split.table_ids) {
        tableColorMap.set(tid, split.section_color);
      }
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Mode tabs + venue selector */}
        <div className="flex items-center bg-white border-b">
          <div className="flex">
            <button
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isLayout
                  ? 'border-keva-sage-600 text-keva-sage-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setMode('layout')}
            >
              <Pencil className="w-4 h-4" />
              Edit Layout
            </button>
            <button
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                !isLayout
                  ? 'border-keva-sage-600 text-keva-sage-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setMode('staff')}
            >
              <Users className="w-4 h-4" />
              Assign Staff
            </button>
          </div>

          {/* Venue selector (always visible) */}
          {venues.length > 1 && (
            <div className="ml-4">
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
            </div>
          )}
        </div>

        {/* Layout toolbar — only in edit mode */}
        {isLayout && (
          <FloorPlanToolbar
            venues={venues}
            selectedVenueId={venueId}
            onVenueChange={handleVenueChange}
            onAddTable={handleAddTable}
            onAddLabel={handleAddLabel}
            onManageSections={() => setSectionManagerOpen(true)}
            onImportSr={handleImportSr}
            importing={importing}
            onSave={handleSaveLayout}
            onReset={handleReset}
            hasChanges={hasChanges}
            saving={saving}
            snapEnabled={snapEnabled}
            onToggleSnap={() => setSnapEnabled((v) => !v)}
          />
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Canvas */}
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
                selectedTableIds={isLayout ? selectedTableIds : new Set()}
                highlightedTableIds={!isLayout ? highlightedTableIds : new Set()}
                tableColorMap={!isLayout ? tableColorMap : undefined}
                onSelectTable={(id: string, additive: boolean) => {
                  if (!isLayout) return;
                  setSelectedTableIds((prev) => {
                    if (additive) {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    }
                    return new Set([id]);
                  });
                }}
                onDeselectAll={() => setSelectedTableIds(new Set())}
                onDoubleClickTable={handleEditTable}
                onResize={isLayout ? handleTableResize : undefined}
                onDoubleClickLabel={isLayout ? handleEditLabel : undefined}
                readOnly={!isLayout}
              />
            )}
          </div>

          {/* Staff sidebar — only in staff mode */}
          {!isLayout && (
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
          )}
        </div>
      </div>

      {/* Dialogs (layout mode only) */}
      <TableDialog
        open={tableDialogOpen}
        onOpenChange={setTableDialogOpen}
        table={editingTable}
        sections={sections}
        onSave={handleSaveTable}
        onDelete={handleDeleteTable}
      />

      <LabelDialog
        open={labelDialogOpen}
        onOpenChange={setLabelDialogOpen}
        label={editingLabel}
        onSave={handleSaveLabel}
        onDelete={handleDeleteLabel}
      />

      <SectionManager
        open={sectionManagerOpen}
        onOpenChange={setSectionManagerOpen}
        sections={sections}
        srSeatingAreas={srSeatingAreas}
        onSave={handleSaveSection}
        onDelete={handleDeleteSection}
      />
    </DndContext>
  );
}
