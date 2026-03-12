'use client';

import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';

interface ReservationEntry {
  id: string;
  guest_name: string;
  party_size: number;
  arrival_time: string;
  status: string;
  is_vip: boolean;
  notes: string | null;
}

interface WaitlistEntry {
  id: string;
  guest_name: string;
  party_size: number;
  quoted_wait: number | null;
  added_at: string;
  status: string;
}

interface HostStandSidebarProps {
  upcoming: ReservationEntry[];
  seatedReservations: ReservationEntry[];
  completed: ReservationEntry[];
  noShows: ReservationEntry[];
  cancelled: ReservationEntry[];
  waitlist: WaitlistEntry[];
  onAddWaitlist: () => void;
  onSeatWalkin: () => void;
  onNewReservation?: () => void;
  onMarkArrived?: (rezId: string) => Promise<void>;
  onMarkNoShow?: (rezId: string) => Promise<void>;
  onCancelReservation?: (rezId: string) => Promise<void>;
}

/** Format "HH:MM:SS" or "HH:MM" → "8:00 PM" */
function formatTime(time: string): string {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

/** Collapsible section header */
function SectionHeader({
  label,
  count,
  isOpen,
  onToggle,
  dot,
}: {
  label: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  dot?: string;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-400 transition-colors"
    >
      <span className="flex items-center gap-1.5">
        {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
        {label} ({count})
      </span>
      <span className="text-[10px]">{isOpen ? '\u25B2' : '\u25BC'}</span>
    </button>
  );
}

/** Draggable wrapper for upcoming reservation rows */
function DraggableRezRow({ r }: { r: ReservationEntry }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `rez-${r.id}`,
    data: { type: 'reservation', reservation: r },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.4 : 1, cursor: 'grab', touchAction: 'none' }}
    >
      <RezRow r={r} />
    </div>
  );
}

/** Reusable reservation row */
function RezRow({ r, statusColor }: { r: ReservationEntry; statusColor?: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {statusColor && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
          )}
          <span className="text-sm font-medium text-white truncate">
            {r.guest_name || 'Guest'}
          </span>
          {r.is_vip && (
            <span className="text-[10px] font-bold text-[#FF5A1F] bg-[#FF5A1F]/10 px-1.5 py-0.5 rounded">
              VIP
            </span>
          )}
          {r.status === 'arrived' && (
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
              HERE
            </span>
          )}
        </div>
        {r.notes && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{r.notes}</p>
        )}
      </div>
      <div className="text-right ml-3 shrink-0">
        <div className="text-sm font-medium text-gray-300">{formatTime(r.arrival_time)}</div>
        <div className="text-xs text-gray-500">{r.party_size} covers</div>
      </div>
    </div>
  );
}

export function HostStandSidebar({
  upcoming,
  seatedReservations,
  completed,
  noShows,
  cancelled,
  waitlist,
  onAddWaitlist,
  onSeatWalkin,
}: HostStandSidebarProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    upcoming: true,
    seated: true,
    past: false,
    waitlist: true,
  });

  const toggle = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const pastCount = completed.length + noShows.length + cancelled.length;

  return (
    <div className="flex flex-col h-full bg-[#111111] border-r border-gray-800 overflow-y-auto">
      {/* Upcoming */}
      <div className="shrink-0 px-4 pt-4 pb-2 border-b border-gray-800">
        <SectionHeader
          label="Upcoming"
          count={upcoming.length}
          isOpen={openSections.upcoming}
          onToggle={() => toggle('upcoming')}
        />
        {openSections.upcoming && (
          upcoming.length === 0 ? (
            <p className="text-sm text-gray-600 pb-2">No upcoming reservations</p>
          ) : (
            <div className="space-y-2 pb-2">
              {upcoming.map((r) => (
                <DraggableRezRow key={r.id} r={r} />
              ))}
            </div>
          )
        )}
      </div>

      {/* Seated */}
      <div className="shrink-0 px-4 pt-2 pb-2 border-b border-gray-800">
        <SectionHeader
          label="Seated"
          count={seatedReservations.length}
          isOpen={openSections.seated}
          onToggle={() => toggle('seated')}
          dot="#F59E0B"
        />
        {openSections.seated && (
          seatedReservations.length === 0 ? (
            <p className="text-sm text-gray-600 pb-2">No guests seated</p>
          ) : (
            <div className="space-y-2 pb-2">
              {seatedReservations.map((r) => (
                <RezRow key={r.id} r={r} statusColor="#F59E0B" />
              ))}
            </div>
          )
        )}
      </div>

      {/* No-Show / Cancelled / Done */}
      {pastCount > 0 && (
        <div className="shrink-0 px-4 pt-2 pb-2 border-b border-gray-800">
          <SectionHeader
            label={`No-Show ${noShows.length} / Cancelled ${cancelled.length} / Done ${completed.length}`}
            count={pastCount}
            isOpen={openSections.past}
            onToggle={() => toggle('past')}
          />
          {openSections.past && (
            <div className="space-y-1.5 pb-2 max-h-48 overflow-y-auto">
              {noShows.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg opacity-70">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <span className="text-xs text-white truncate">{r.guest_name || 'Guest'}</span>
                    <span className="text-[10px] text-red-400 font-semibold">NO SHOW</span>
                  </div>
                  <span className="text-xs text-gray-500 ml-2">{r.party_size} cvr</span>
                </div>
              ))}
              {cancelled.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg opacity-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-gray-500 shrink-0" />
                    <span className="text-xs text-gray-400 truncate line-through">{r.guest_name || 'Guest'}</span>
                  </div>
                  <span className="text-xs text-gray-600 ml-2">{r.party_size} cvr</span>
                </div>
              ))}
              {completed.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg opacity-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                    <span className="text-xs text-gray-400 truncate">{r.guest_name || 'Guest'}</span>
                  </div>
                  <span className="text-xs text-gray-600 ml-2">{r.party_size} cvr</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Waitlist */}
      <div className="shrink-0 px-4 pt-2 pb-2 border-b border-gray-800">
        <SectionHeader
          label="Waitlist"
          count={waitlist.length}
          isOpen={openSections.waitlist}
          onToggle={() => toggle('waitlist')}
        />
        {openSections.waitlist && (
          waitlist.length === 0 ? (
            <p className="text-sm text-gray-600 pb-2">No parties waiting</p>
          ) : (
            <div className="space-y-2 pb-2">
              {waitlist.map((w) => {
                const waitMinutes = Math.round(
                  (Date.now() - new Date(w.added_at).getTime()) / 60000,
                );
                return (
                  <div
                    key={w.id}
                    className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg"
                  >
                    <div>
                      <span className="text-sm text-white">{w.guest_name}</span>
                      <span className="text-xs text-gray-500 ml-2">{w.party_size} covers</span>
                    </div>
                    <span className="text-xs text-gray-400 tabular-nums">{waitMinutes}m</span>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Action buttons — always visible at bottom */}
      <div className="shrink-0 p-4 mt-auto">
        <div className="space-y-2">
          <button
            onClick={onAddWaitlist}
            className="w-full h-12 bg-[#1a1a1a] hover:bg-[#222] text-white text-sm font-medium rounded-lg border border-gray-700 transition-colors"
          >
            Add to Waitlist
          </button>
          <button
            onClick={onSeatWalkin}
            className="w-full h-12 bg-[#FF5A1F] hover:bg-[#E04D18] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Seat Walk-in
          </button>
        </div>
      </div>
    </div>
  );
}
