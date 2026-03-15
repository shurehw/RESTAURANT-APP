'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { FloorPlanToolbar } from './FloorPlanToolbar';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import { TableDialog } from './TableDialog';
import { SectionManager } from './SectionManager';
import { LabelDialog } from './LabelDialog';
import { getDefaultTableSize } from './TableShape';
import type { VenueTable, VenueSection, VenueLabel, FloorPlan } from '@/lib/database/floor-plan';

interface FloorPlanBuilderProps {
  venues: { id: string; name: string }[];
  initialVenueId: string;
}

export function FloorPlanBuilder({ venues, initialVenueId }: FloorPlanBuilderProps) {
  // ── State ──────────────────────────────────────────────────────
  const [venueId, setVenueId] = useState(initialVenueId);
  const [sections, setSections] = useState<VenueSection[]>([]);
  const [tables, setTables] = useState<VenueTable[]>([]);
  const [labels, setLabels] = useState<VenueLabel[]>([]);

  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(new Set());
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<VenueTable | null>(null);
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<VenueLabel | null>(null);
  const [srSeatingAreas, setSrSeatingAreas] = useState<string[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(false);

  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  // Track original state for dirty detection
  const originalTablesRef = useRef<string>('');
  const originalLabelsRef = useRef<string>('');
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

  useEffect(() => {
    loadFloorPlan();
  }, [loadFloorPlan]);

  // Load SR seating areas for the section manager
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/sales/reservations?venue_id=${venueId}&date=${today}&seating_areas_only=true`)
      .then((r) => r.json())
      .then((d) => setSrSeatingAreas(d.seating_areas || []))
      .catch(() => setSrSeatingAreas([]));
  }, [venueId]);

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
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Escape') {
        setSelectedTableIds(new Set());
        return;
      }

      if (selectedTableIds.size === 0) return;

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

      const NUDGE = e.shiftKey ? 2.5 : 0.5;
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
  }, [selectedTableIds, snapEnabled]);

  // ── Snap helper ──────────────────────────────────────────────
  const snap = (val: number, grid: number) => Math.round(val / grid) * grid;

  // ── Drag Handlers ──────────────────────────────────────────────
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      const activeData = active.data.current;
      if (!activeData) return;

      if (activeData.type === 'table') {
        const table = activeData.table as VenueTable;
        const container = document.querySelector('[style*="aspect-ratio"]');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const dxPct = (delta.x / rect.width) * 100;
        const dyPct = (delta.y / rect.height) * 100;

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
      const tableUpdates = tables.map((t) => ({
        id: t.id, pos_x: t.pos_x, pos_y: t.pos_y,
        width: t.width, height: t.height, rotation: t.rotation, section_id: t.section_id,
      }));
      const res = await fetch('/api/floor-plan/tables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId, updates: tableUpdates }),
      });
      if (!res.ok) throw new Error('Failed to save tables');

      if (labels.length > 0) {
        const labelUpdates = labels.map((l) => ({ id: l.id, pos_x: l.pos_x, pos_y: l.pos_y }));
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
    if (originalTablesRef.current) setTables(JSON.parse(originalTablesRef.current));
    if (originalLabelsRef.current) setLabels(JSON.parse(originalLabelsRef.current));
    setHasChanges(false);
  };

  const handleAddTable = () => { setEditingTable(null); setTableDialogOpen(true); };

  const handleEditTable = (table: VenueTable) => { setEditingTable(table); setTableDialogOpen(true); };

  const handleSaveTable = async (data: {
    table_number: string; min_capacity: number; max_capacity: number;
    shape: string; section_id: string | null;
  }) => {
    try {
      const defaultSize = editingTable ? {} : getDefaultTableSize(data.shape as VenueTable['shape'], data.max_capacity);
      const body = {
        venue_id: venueId,
        ...(editingTable ? { id: editingTable.id } : {}),
        ...data,
        ...(editingTable ? {} : { pos_x: 45 + Math.random() * 10, pos_y: 45 + Math.random() * 10, ...defaultSize }),
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
    } catch (err) { console.error('[floor-plan] Table delete error:', err); }
  };

  const handleSaveSection = async (section: {
    id?: string; name: string; color: string; sr_seating_area: string | null; sort_order: number;
  }) => {
    try {
      const res = await fetch('/api/floor-plan/sections', {
        method: section.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId, ...section }),
      });
      if (!res.ok) throw new Error('Failed to save section');
      await loadFloorPlan();
    } catch (err) { console.error('[floor-plan] Section save error:', err); }
  };

  const handleDeleteSection = async (id: string) => {
    try {
      await fetch(`/api/floor-plan/sections?id=${id}`, { method: 'DELETE' });
      await loadFloorPlan();
    } catch (err) { console.error('[floor-plan] Section delete error:', err); }
  };

  const handleAddLabel = () => { setEditingLabel(null); setLabelDialogOpen(true); };
  const handleEditLabel = (label: VenueLabel) => { setEditingLabel(label); setLabelDialogOpen(true); };

  const handleSaveLabel = async (data: { text: string; font_size: number; color: string }) => {
    try {
      const body = {
        venue_id: venueId,
        ...(editingLabel ? { id: editingLabel.id } : {}),
        ...data,
        ...(editingLabel ? {} : { pos_x: 45 + Math.random() * 10, pos_y: 45 + Math.random() * 10 }),
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
    } catch (err) { console.error('[floor-plan] Label delete error:', err); }
  };

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
      if (!res.ok) { alert(data.error || 'Import failed'); return; }
      alert(data.message || `Imported ${data.imported} tables`);
      if (data.imported > 0) await loadFloorPlan();
    } catch (err) {
      console.error('[floor-plan] Import error:', err);
      alert('Failed to import tables from SevenRooms');
    } finally {
      setImporting(false);
    }
  };

  const handleVenueChange = (id: string) => {
    setVenueId(id);
    window.history.replaceState(null, '', `?venue=${id}`);
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-[calc(100vh-64px)]">
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

        <div className="flex flex-1 overflow-hidden">
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
                selectedTableIds={selectedTableIds}
                highlightedTableIds={new Set()}
                onSelectTable={(id: string, additive: boolean) => {
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
                onResize={handleTableResize}
                onDoubleClickLabel={handleEditLabel}
                readOnly={false}
              />
            )}
          </div>
        </div>
      </div>

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
