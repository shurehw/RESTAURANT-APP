'use client';

import { useState } from 'react';

interface AddWaitlistDialogProps {
  venueId: string;
  date: string;
  onClose: () => void;
  onAdded: () => void;
}

export function AddWaitlistDialog({ venueId, date, onClose, onAdded }: AddWaitlistDialogProps) {
  const [guestName, setGuestName] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          guest_name: guestName,
          party_size: partySize,
          phone: phone || undefined,
          date,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add to waitlist');
      }

      onAdded();
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
        <h2 className="text-lg font-bold text-white mb-4">Add to Waitlist</h2>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-2 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Guest Name</label>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#FF5A1F]"
              placeholder="Name"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Party Size</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPartySize(n)}
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
            <label className="block text-sm text-gray-400 mb-1">Phone (optional)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#FF5A1F]"
              placeholder="(555) 123-4567"
              type="tel"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#FF5A1F]"
              placeholder="Seating preference, occasion..."
            />
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
              disabled={loading || !guestName}
              className="flex-1 h-12 bg-[#FF5A1F] hover:bg-[#E04D18] text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
