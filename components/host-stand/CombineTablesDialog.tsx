'use client';

import { useState } from 'react';

interface AvailableTable {
  table_id: string;
  table_number: string;
  max_capacity: number;
  section_id: string | null;
}

interface CombineTablesDialogProps {
  primaryTable: AvailableTable;
  availableTables: AvailableTable[];
  venueId: string;
  date: string;
  onClose: () => void;
  onCombined: () => void;
}

export function CombineTablesDialog({
  primaryTable,
  availableTables,
  venueId,
  date,
  onClose,
  onCombined,
}: CombineTablesDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exclude the primary table from the pick list
  const candidates = availableTables.filter((t) => t.table_id !== primaryTable.table_id);

  const toggleTable = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalCapacity =
    primaryTable.max_capacity +
    candidates
      .filter((t) => selectedIds.has(t.table_id))
      .reduce((s, t) => s + t.max_capacity, 0);

  const handleConfirm = async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/floor-plan/live/combos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          date,
          primary_table_id: primaryTable.table_id,
          secondary_table_ids: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to combine');
      onCombined();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-sm bg-[#141414] rounded-xl border border-gray-700 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white mb-1">Combine Tables</h2>
        <p className="text-sm text-gray-400 mb-4">
          Primary: Table <span className="text-white font-semibold">{primaryTable.table_number}</span>
          {' '}({primaryTable.max_capacity} seats)
        </p>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-2 text-sm mb-3">
            {error}
          </div>
        )}

        {candidates.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No other available tables to combine.</p>
        ) : (
          <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
            {candidates.map((t) => {
              const isSelected = selectedIds.has(t.table_id);
              return (
                <button
                  key={t.table_id}
                  onClick={() => toggleTable(t.table_id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors ${
                    isSelected
                      ? 'bg-[#D4622B]/10 border-[#D4622B]/40 text-white'
                      : 'bg-[#1a1a1a] border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <span className="font-medium">Table {t.table_number}</span>
                  <span className="text-gray-400">{t.max_capacity} seats</span>
                </button>
              );
            })}
          </div>
        )}

        {selectedIds.size > 0 && (
          <p className="text-xs text-gray-400 mb-3 text-center">
            Combined capacity: <span className="text-white font-semibold">{totalCapacity} seats</span>
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 bg-[#1a1a1a] hover:bg-[#222] text-white rounded-lg border border-gray-700 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || selectedIds.size === 0}
            className="flex-1 h-12 bg-[#D4622B] hover:bg-[#A3461F] text-white rounded-lg font-semibold disabled:opacity-50"
          >
            {loading ? 'Combining...' : `Combine (${selectedIds.size + 1} tables)`}
          </button>
        </div>
      </div>
    </div>
  );
}
