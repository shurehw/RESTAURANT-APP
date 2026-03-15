'use client';

import { Button } from '@/components/ui/button';
import { Save, RotateCcw, Plus, Settings2, Type, Grid3X3, Download } from 'lucide-react';

interface FloorPlanToolbarProps {
  venues: { id: string; name: string }[];
  selectedVenueId: string;
  onVenueChange: (venueId: string) => void;
  onAddTable: () => void;
  onAddLabel: () => void;
  onManageSections: () => void;
  onImportSr: () => void;
  importing: boolean;
  onSave: () => void;
  onReset: () => void;
  hasChanges: boolean;
  saving: boolean;
  snapEnabled: boolean;
  onToggleSnap: () => void;
}

export function FloorPlanToolbar({
  venues,
  selectedVenueId,
  onVenueChange,
  onAddTable,
  onAddLabel,
  onManageSections,
  onImportSr,
  importing,
  onSave,
  onReset,
  hasChanges,
  saving,
  snapEnabled,
  onToggleSnap,
}: FloorPlanToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-50 border-b">
      {/* Venue selector */}
      {venues.length > 1 && (
        <>
          <select
            value={selectedVenueId}
            onChange={(e) => onVenueChange(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm bg-white"
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <div className="border-l h-6 mx-1" />
        </>
      )}

      {/* Layout actions */}
      <Button variant="outline" size="sm" onClick={onAddTable}>
        <Plus className="w-4 h-4 mr-1" />
        Add Table
      </Button>

      <Button variant="outline" size="sm" onClick={onAddLabel}>
        <Type className="w-4 h-4 mr-1" />
        Add Label
      </Button>

      <Button variant="outline" size="sm" onClick={onManageSections}>
        <Settings2 className="w-4 h-4 mr-1" />
        Sections
      </Button>

      <Button variant="outline" size="sm" onClick={onImportSr} disabled={importing}>
        <Download className="w-4 h-4 mr-1" />
        {importing ? 'Importing...' : 'Import SR'}
      </Button>

      <div className="border-l h-6 mx-1" />

      {/* Snap toggle */}
      <Button
        variant={snapEnabled ? 'default' : 'outline'}
        size="sm"
        onClick={onToggleSnap}
        className={snapEnabled ? 'bg-keva-sage-600 hover:bg-keva-sage-700' : ''}
        title="Snap to grid"
      >
        <Grid3X3 className="w-4 h-4 mr-1" />
        Snap
      </Button>

      <div className="flex-1" />

      {/* Save/Reset */}
      {hasChanges && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="w-4 h-4 mr-1" />
          Reset
        </Button>
      )}

      <Button
        size="sm"
        onClick={onSave}
        disabled={!hasChanges || saving}
        className="bg-keva-sage-600 hover:bg-keva-sage-700"
      >
        <Save className="w-4 h-4 mr-1" />
        {saving ? 'Saving...' : 'Save Layout'}
      </Button>
    </div>
  );
}
