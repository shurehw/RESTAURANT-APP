'use client';

import { useState } from 'react';

interface SeatWalkinDialogProps {
  venueId: string;
  date: string;
  tableId?: string;
  tableNumber?: string;
  onClose: () => void;
  onSeated: () => void;
}

export function SeatWalkinDialog({
  venueId,
  date,
  tableId,
  tableNumber,
  onClose,
  onSeated,
}: SeatWalkinDialogProps) {
  const [partySize, setPartySize] = useState(2);
  const [guestName, setGuestName] = useState('');
  const [duration, setDuration] = useState(90);
  const [selectedTableId, setSelectedTableId] = useState(tableId || '');
  const [recommendations, setRecommendations] = useState<
    { table_id: string; table_number: string; score: number }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch table recommendations when party size changes (only if no table pre-selected)
  const fetchRecommendations = async (size: number) => {
    if (tableId) return; // Already have a table
    try {
      const res = await fetch(
        `/api/floor-plan/live?venue_id=${venueId}&date=${date}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      // Filter to available tables that fit the party
      const available = (data.tables || [])
        .filter(
          (t: any) => t.status === 'available' && t.max_capacity >= size,
        )
        .sort((a: any, b: any) => {
          // Prefer closest capacity match
          const aDiff = a.max_capacity - size;
          const bDiff = b.max_capacity - size;
          return aDiff - bDiff;
        })
        .slice(0, 5)
        .map((t: any) => ({
          table_id: t.table_id,
          table_number: t.table_number,
          score: 100 - (t.max_capacity - size) * 10,
        }));
      setRecommendations(available);
      if (available.length > 0 && !selectedTableId) {
        setSelectedTableId(available[0].table_id);
      }
    } catch {
      // Non-critical
    }
  };

  const handlePartySizeChange = (size: number) => {
    setPartySize(size);
    fetchRecommendations(size);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTableId) {
      setError('Select a table');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/floor-plan/live/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          table_id: selectedTableId,
          date,
          action: 'seat',
          party_size: partySize,
          expected_duration: duration,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to seat party');
      }

      onSeated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md bg-[#141414] rounded-xl border border-gray-700 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white mb-4">
          Seat Walk-in{tableNumber ? ` — Table ${tableNumber}` : ''}
        </h2>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-2 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Party Size</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handlePartySizeChange(n)}
                  className={`flex-1 h-12 rounded-lg text-base font-medium transition-colors ${
                    partySize === n
                      ? 'bg-[#FF5A1F] text-white'
                      : 'bg-[#1a1a1a] text-gray-300 border border-gray-700'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Guest Name (optional)</label>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#FF5A1F]"
              placeholder="Walk-in guest"
            />
          </div>

          {/* Table selection (only if no table pre-selected) */}
          {!tableId && recommendations.length > 0 && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Table</label>
              <div className="flex gap-2 flex-wrap">
                {recommendations.map((r) => (
                  <button
                    key={r.table_id}
                    type="button"
                    onClick={() => setSelectedTableId(r.table_id)}
                    className={`px-4 h-12 rounded-lg text-base font-medium transition-colors ${
                      selectedTableId === r.table_id
                        ? 'bg-[#FF5A1F] text-white'
                        : 'bg-[#1a1a1a] text-gray-300 border border-gray-700'
                    }`}
                  >
                    {r.table_number}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Expected Duration</label>
            <div className="flex gap-2">
              {[60, 90, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuration(m)}
                  className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                    duration === m
                      ? 'bg-[#FF5A1F] text-white'
                      : 'bg-[#1a1a1a] text-gray-300 border border-gray-700'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 bg-[#1a1a1a] hover:bg-[#222] text-white rounded-lg border border-gray-700 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedTableId}
              className="flex-1 h-12 bg-[#FF5A1F] hover:bg-[#E04D18] text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Seating...' : 'Seat Party'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
