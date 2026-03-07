'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { FloorPlanToolbar } from './FloorPlanToolbar';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import { StaffSidebar } from './StaffSidebar';
import { TableDialog } from './TableDialog';
import { SectionManager } from './SectionManager';
import { LabelDialog } from './LabelDialog';
import { getDefaultTableSize } from './TableShape';
import type { VenueTable, VenueSection, VenueLabel, FloorPlan } from '@/lib/database/floor-plan';

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
  const [assignments, setAssignments] = useState<any[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
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
  const [staffLoading, setStaffLoading] = useState(false);
  const [importing, setImporting] = useState(false);

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

  const loadStaffAssignments = useCallback(async () => {
    setStaffLoading(true);
    try {
      const res = await fetch(
        `/api/floor-plan/assignments?venue_id=${venueId}&date=${date}&shift_type=${shiftType}&include_scheduled=true`,
      );
      if (!res.ok) throw new Error('Failed to load staff');
      const data = await res.json();
      setAssignments(data.assignments);
      setUnassigned(data.unassigned);
    } catch (err) {
      console.error('[floor-plan] Staff load error:', err);
    } finally {
      setStaffLoading(false);
    }
  }, [venueId, date, shiftType]);

  useEffect(() => {
    loadFloorPlan();
  }, [loadFloorPlan]);

  useEffect(() => {
    if (!loading) loadStaffAssignments();
  }, [date, shiftType, loading, loadStaffAssignments]);

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

  // ── Snap helper ──────────────────────────────────────────────
  const snap = (val: number, grid: number) => Math.round(val / grid) * grid;

  // ── Drag Handlers ──────────────────────────────────────────────
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, delta } = event;
      const activeData = active.data.current;

      if (!activeData) return;

      // Table dragged on canvas → update position
      if (activeData.type === 'table') {
        const table = activeData.table as VenueTable;

        const container = document.querySelector('[style*="aspect-ratio"]');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const dxPct = (delta.x / rect.width) * 100;
        const dyPct = (delta.y / rect.height) * 100;

        setTables((prev) =>
          prev.map((t) => {
            if (t.id !== table.id) return t;
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

      // Staff dragged onto a section drop zone → assign
      if (activeData.type === 'staff' && over?.data.current?.type === 'section') {
        const employeeId = activeData.employeeId as string;
        const sectionId = over.data.current.sectionId as string;
        handleAssignStaff(employeeId, sectionId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapEnabled],
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

  // ── Staff Handlers ─────────────────────────────────────────────
  const handleAssignStaff = async (employeeId: string, sectionId: string) => {
    try {
      const res = await fetch('/api/floor-plan/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          section_id: sectionId,
          employee_id: employeeId,
          business_date: date,
          shift_type: shiftType,
        }),
      });
      if (!res.ok) throw new Error('Failed to assign staff');
      await loadStaffAssignments();
    } catch (err) {
      console.error('[floor-plan] Assign error:', err);
    }
  };

  const handleRemoveAssignment = async (employeeId: string) => {
    const assignment = assignments.find((a: any) => a.employee_id === employeeId);
    if (!assignment) return;
    try {
      await fetch(`/api/floor-plan/assignments?id=${assignment.id}`, {
        method: 'DELETE',
      });
      await loadStaffAssignments();
    } catch (err) {
      console.error('[floor-plan] Remove assignment error:', err);
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
                selectedTableId={selectedTableId}
                onSelectTable={setSelectedTableId}
                onDoubleClickTable={handleEditTable}
                onResize={handleTableResize}
                onDoubleClickLabel={handleEditLabel}
              />
            )}
          </div>

          {/* Staff sidebar */}
          <StaffSidebar
            sections={sections}
            assignments={assignments}
            unassigned={unassigned}
            onRemoveAssignment={handleRemoveAssignment}
            date={date}
            onDateChange={setDate}
            shiftType={shiftType}
            onShiftTypeChange={setShiftType}
            loading={staffLoading}
          />
        </div>
      </div>

      {/* Dialogs */}
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
