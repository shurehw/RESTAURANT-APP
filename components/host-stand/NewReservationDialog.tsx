'use client';

import { useState } from 'react';

interface NewReservationDialogProps {
  venueId: string;
  date: string;
  onClose: () => void;
  onCreated: () => void;
}

function generateTimeSlots(startH = 11, endH = 23, intervalMin = 30): string[] {
  const slots: string[] = [];
  let h = startH;
  let m = 0;
  while (h < endH || (h === endH && m === 0)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += intervalMin;
    if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}

function formatSlot(time: string): string {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
}

const TIME_SLOTS = generateTimeSlots(11, 23, 30);

export function NewReservationDialog({ venueId, date, onClose, onCreated }: NewReservationDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [arrivalTime, setArrivalTime] = useState('18:00');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          first_name: firstName,
          last_name: lastName || undefined,
          phone: phone || undefined,
          party_size: partySize,
          business_date: date,
          arrival_time: arrivalTime,
          notes: notes || undefined,
          channel: 'phone',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 || data.slot) {
          const rem = data.remaining ?? 0;
          throw new Error(`Slot full — ${rem} cover${rem !== 1 ? 's' : ''} remaining. Try another time.`);
        }
        throw new Error(data.error || 'Failed to create reservation');
      }

      onCreated();
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
        className="relative w-full max-w-md bg-[#141414] rounded-xl border border-gray-700 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white mb-4">New Reservation</h2>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">First Name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#FF5A1F]"
                placeholder="First"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Last Name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#FF5A1F]"
                placeholder="Last"
              />
            </div>
          </div>

          {/* Party size */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Party Size</label>
            <div className="grid grid-cols-6 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPartySize(n)}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    partySize === n
                      ? 'bg-[#FF5A1F] text-white'
                      : 'bg-[#1a1a1a] text-gray-300 border border-gray-700 hover:border-gray-500'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Arrival Time</label>
            <select
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#FF5A1F] appearance-none"
            >
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>{formatSlot(slot)}</option>
              ))}
            </select>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Phone (optional)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#FF5A1F]"
              placeholder="(555) 123-4567"
              type="tel"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#FF5A1F]"
              placeholder="Birthday, seating preference, allergies..."
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
              disabled={loading || !firstName || !arrivalTime}
              className="flex-1 h-12 bg-[#FF5A1F] hover:bg-[#E04D18] text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Booking...' : 'Book Reservation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
