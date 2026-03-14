'use client';

import { useEffect, useState } from 'react';

interface Suggestion {
  id: string;
  expires_at: string;
  reservation_id: string;
  guest_name: string;
  party_size: number;
  is_vip: boolean;
  table_id: string;
  table_number: string;
  section_name: string | null;
  section_color: string | null;
  reason: string | null;
}

interface SeatSuggestionToastProps {
  suggestion: Suggestion;
  onAccept: (suggestion: Suggestion) => void;
  onDismiss: (suggestion: Suggestion, outcome: 'dismissed' | 'expired') => void;
}

export function SeatSuggestionToast({ suggestion, onAccept, onDismiss }: SeatSuggestionToastProps) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const ms = new Date(suggestion.expires_at).getTime() - Date.now();
    return Math.max(0, Math.round(ms / 1000));
  });

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) {
      onDismiss(suggestion, 'expired');
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, suggestion, onDismiss]);

  const progress = secondsLeft / 90; // 90s total

  return (
    <div
      className="fixed bottom-20 right-4 z-50 w-72 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
      style={{ animation: 'slide-in-right 200ms ease-out' }}
    >
      {/* Progress bar */}
      <div className="h-0.5 bg-gray-800">
        <div
          className="h-full bg-[#D4622B] transition-all duration-1000"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[#D4622B] uppercase tracking-wider">
              AI Suggestion
            </span>
            {suggestion.is_vip && (
              <span className="text-[9px] font-bold text-[#D4622B] bg-[#D4622B]/10 px-1 py-0.5 rounded">
                VIP
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-500 tabular-nums">{secondsLeft}s</span>
        </div>

        {/* Guest info */}
        <div className="mb-3">
          <p className="text-sm font-semibold text-white">
            {suggestion.guest_name}
            <span className="text-gray-400 font-normal ml-1">· {suggestion.party_size} covers</span>
          </p>
          {suggestion.reason && (
            <p className="text-xs text-gray-500 mt-0.5">{suggestion.reason}</p>
          )}
        </div>

        {/* Suggested table */}
        <div
          className="flex items-center gap-3 p-3 rounded-lg mb-3"
          style={{
            background: suggestion.section_color ? `${suggestion.section_color}12` : '#222',
            border: `1px solid ${suggestion.section_color ? `${suggestion.section_color}30` : '#333'}`,
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: suggestion.section_color || '#D4622B' }}
          >
            {suggestion.table_number}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Table {suggestion.table_number}</p>
            {suggestion.section_name && (
              <p className="text-[11px] text-gray-400">{suggestion.section_name}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onAccept(suggestion)}
            className="flex-1 h-10 bg-[#D4622B] hover:bg-[#A3461F] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Seat Here
          </button>
          <button
            onClick={() => onDismiss(suggestion, 'dismissed')}
            className="h-10 px-4 bg-[#222] hover:bg-[#2a2a2a] text-gray-400 text-sm rounded-lg border border-gray-700 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
