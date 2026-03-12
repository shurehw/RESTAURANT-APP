'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TableState } from '@/lib/floor-management/table-state-machine';
import { STATE_COLORS, STATE_LABELS } from './constants';

// ── Types ────────────────────────────────────────────────────────

interface TableInfo {
  table_id: string;
  table_number: string;
  status: TableState;
  party_size: number | null;
  guest_name?: string;
  seated_at: string | null;
  current_spend: number;
  turn_number: number;
  max_capacity: number;
  reservation_id: string | null;
  reservation_notes: string | null;
  client_requests: string | null;
}

interface TableActionSheetProps {
  table: TableInfo;
  venueId: string;
  businessDate: string;
  onAction: (action: string, extra?: Record<string, unknown>) => void;
  onClose: () => void;
  onNoteAdded?: () => void;
}

interface FetchedNote {
  id: string;
  note_type: 'service' | 'guest';
  note_text: string;
  author_name: string | null;
  sr_write_status: string | null;
  created_at: string;
}

/** Actions available for each state */
const STATE_ACTIONS: Record<TableState, { label: string; action: string; variant?: 'primary' | 'danger' }[]> = {
  available: [
    { label: 'Seat Walk-in', action: 'seat_walkin', variant: 'primary' },
    { label: 'Block Table', action: 'block' },
  ],
  reserved: [
    { label: 'Seat Party', action: 'seat', variant: 'primary' },
    { label: 'Cancel Reservation', action: 'clear', variant: 'danger' },
  ],
  seated: [
    { label: 'Mark Complete', action: 'force_complete', variant: 'primary' },
  ],
  occupied: [
    { label: 'Mark Complete', action: 'force_complete', variant: 'primary' },
  ],
  check_dropped: [
    { label: 'Mark Bussing', action: 'bus', variant: 'primary' },
    { label: 'Mark Complete', action: 'force_complete' },
  ],
  bussing: [
    { label: 'Clear Table', action: 'clear', variant: 'primary' },
  ],
  blocked: [
    { label: 'Unblock', action: 'unblock', variant: 'primary' },
  ],
};

const GUEST_STATES: TableState[] = ['reserved', 'seated', 'occupied', 'check_dropped'];

export function TableActionSheet({
  table,
  venueId,
  businessDate,
  onAction,
  onClose,
  onNoteAdded,
}: TableActionSheetProps) {
  const actions = STATE_ACTIONS[table.status] || [];
  const seatedMinutes = table.seated_at
    ? Math.round((Date.now() - new Date(table.seated_at).getTime()) / 60000)
    : null;

  const showNotes = GUEST_STATES.includes(table.status);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg bg-[#141414] rounded-t-2xl border-t border-gray-700 p-6 pb-8 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-4" />

        {/* Table info */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: STATE_COLORS[table.status] }}
            />
            <h3 className="text-xl font-bold text-white">Table {table.table_number}</h3>
          </div>
          <span className="text-sm text-gray-400">
            {STATE_LABELS[table.status]}
          </span>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
          <Detail label="Capacity" value={`${table.max_capacity} seats`} />
          <Detail label="Turns today" value={String(table.turn_number)} />
          {table.party_size && <Detail label="Party size" value={`${table.party_size}`} />}
          {table.guest_name && <Detail label="Guest" value={table.guest_name} />}
          {seatedMinutes !== null && (
            <Detail label="Seated" value={`${seatedMinutes}m ago`} />
          )}
          {table.current_spend > 0 && (
            <Detail label="Spend" value={`$${table.current_spend.toFixed(0)}`} />
          )}
        </div>

        {/* Actions */}
        {actions.length > 0 ? (
          <div className="space-y-2">
            {actions.map((a) => (
              <button
                key={a.action}
                onClick={() => onAction(a.action)}
                className={`w-full h-14 rounded-lg text-base font-semibold transition-colors ${
                  a.variant === 'primary'
                    ? 'bg-[#FF5A1F] hover:bg-[#E04D18] text-white'
                    : a.variant === 'danger'
                      ? 'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-800'
                      : 'bg-[#1a1a1a] hover:bg-[#222] text-white border border-gray-700'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center">No actions available</p>
        )}

        {/* Notes panel — shown when a guest is at/expected at the table */}
        {showNotes && (
          <NotesPanel
            tableId={table.table_id}
            reservationId={table.reservation_id}
            reservationNotes={table.reservation_notes}
            clientRequests={table.client_requests}
            venueId={venueId}
            date={businessDate}
            onNoteAdded={onNoteAdded}
          />
        )}
      </div>
    </div>
  );
}

// ── NotesPanel ──────────────────────────────────────────────────

function NotesPanel({
  tableId,
  reservationId,
  reservationNotes,
  clientRequests,
  venueId,
  date,
  onNoteAdded,
}: {
  tableId: string;
  reservationId: string | null;
  reservationNotes: string | null;
  clientRequests: string | null;
  venueId: string;
  date: string;
  onNoteAdded?: () => void;
}) {
  const [noteType, setNoteType] = useState<'service' | 'guest'>('service');
  const [noteText, setNoteText] = useState('');
  const [serviceNotes, setServiceNotes] = useState<FetchedNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const fetchServiceNotes = useCallback(async () => {
    const params = new URLSearchParams({ venue_id: venueId, date });
    if (tableId) params.set('table_id', tableId);
    if (reservationId) params.set('reservation_id', reservationId);

    try {
      const res = await fetch(`/api/floor-plan/notes?${params}`);
      if (res.ok) {
        const data = await res.json();
        setServiceNotes(data.notes || []);
      }
    } catch {
      // Silently handle — notes are supplementary
    }
  }, [venueId, date, tableId, reservationId]);

  useEffect(() => {
    fetchServiceNotes();
  }, [fetchServiceNotes]);

  const handleSubmit = async () => {
    if (!noteText.trim() || loading) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/floor-plan/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          date,
          note_type: noteType,
          note_text: noteText.trim(),
          table_id: tableId,
          reservation_id: reservationId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({ type: 'error', msg: data.error || 'Failed to save note' });
        return;
      }

      // Show SR write-back status for guest notes
      if (noteType === 'guest' && data.sr_write) {
        if (data.sr_write.status === 'success') {
          setFeedback({ type: 'success', msg: 'Saved to SevenRooms' });
        } else if (data.sr_write.status === 'unsupported') {
          setFeedback({ type: 'success', msg: 'Saved locally (SR write not available)' });
        } else {
          setFeedback({ type: 'error', msg: `Saved locally, SR failed: ${data.sr_write.error}` });
        }
      } else {
        setFeedback({ type: 'success', msg: 'Note saved' });
      }

      setNoteText('');
      fetchServiceNotes();
      onNoteAdded?.();
    } catch {
      setFeedback({ type: 'error', msg: 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  const hasExistingNotes = reservationNotes || clientRequests || serviceNotes.length > 0;

  return (
    <div className="border-t border-gray-700 pt-4 mt-4">
      <div className="text-xs text-gray-500 font-medium mb-3">NOTES</div>

      {/* Existing SR notes */}
      {reservationNotes && (
        <div className="bg-[#1a1a1a] rounded-lg p-3 mb-2">
          <div className="text-[10px] text-blue-400 font-medium mb-1">GUEST NOTES (SR)</div>
          <p className="text-xs text-gray-300 whitespace-pre-wrap">{reservationNotes}</p>
        </div>
      )}
      {clientRequests && (
        <div className="bg-[#1a1a1a] rounded-lg p-3 mb-2">
          <div className="text-[10px] text-blue-400 font-medium mb-1">CLIENT REQUESTS</div>
          <p className="text-xs text-gray-300 whitespace-pre-wrap">{clientRequests}</p>
        </div>
      )}

      {/* Fetched service + guest notes */}
      {serviceNotes.map((n) => (
        <div key={n.id} className="bg-[#1a1a1a] rounded-lg p-3 mb-2">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[10px] font-medium ${
                n.note_type === 'guest' ? 'text-blue-400' : 'text-amber-400'
              }`}
            >
              {n.note_type === 'guest' ? 'GUEST NOTE' : 'SERVICE NOTE'}
            </span>
            <span className="text-[10px] text-gray-600">
              {new Date(n.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              {n.author_name ? ` — ${n.author_name}` : ''}
            </span>
            {n.note_type === 'guest' && n.sr_write_status && n.sr_write_status !== 'success' && (
              <span className="text-[10px] text-yellow-500">(local only)</span>
            )}
          </div>
          <p className="text-xs text-gray-300">{n.note_text}</p>
        </div>
      ))}

      {!hasExistingNotes && (
        <p className="text-xs text-gray-600 mb-3">No notes yet</p>
      )}

      {/* Note type toggle */}
      <div className="flex gap-1 bg-[#1a1a1a] rounded-lg p-1 mt-3 mb-2">
        <button
          onClick={() => setNoteType('service')}
          className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
            noteType === 'service'
              ? 'bg-[#FF5A1F] text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Service Note
        </button>
        <button
          onClick={() => setNoteType('guest')}
          disabled={!reservationId}
          className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
            noteType === 'guest'
              ? 'bg-blue-600 text-white'
              : !reservationId
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-400 hover:text-white'
          }`}
        >
          Guest Note (SR)
        </button>
      </div>

      {/* Hint */}
      <p className="text-[10px] text-gray-600 mb-2">
        {noteType === 'guest'
          ? 'Saved to SevenRooms — visible on future visits'
          : 'Tonight only — operational context for the floor team'}
      </p>

      {/* Input */}
      <textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#FF5A1F]"
        placeholder={
          noteType === 'guest'
            ? 'Allergies, preferences, VIP details...'
            : 'Late arrival, special setup, comp reason...'
        }
        rows={2}
      />

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading || !noteText.trim()}
        className={`w-full h-10 mt-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
          noteType === 'guest'
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-[#FF5A1F] hover:bg-[#E04D18] text-white'
        }`}
      >
        {loading
          ? 'Saving...'
          : `Add ${noteType === 'guest' ? 'Guest' : 'Service'} Note`}
      </button>

      {/* Feedback */}
      {feedback && (
        <p
          className={`text-xs mt-2 ${
            feedback.type === 'success' ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {feedback.msg}
        </p>
      )}
    </div>
  );
}

// ── Detail ──────────────────────────────────────────────────────

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-white font-medium">{value}</div>
    </div>
  );
}
