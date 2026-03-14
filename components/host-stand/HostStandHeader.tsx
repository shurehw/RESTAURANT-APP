'use client';

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface HostStandHeaderProps {
  venueName: string;
  hostName: string;
  businessDate: string;
  onDateNav: (delta: number) => void;
  onDateSet: (date: string) => void;
  connectionStatus?: 'live' | 'degraded' | 'offline';
  connectionLabel?: string;
}

export function HostStandHeader({
  venueName,
  hostName,
  businessDate,
  onDateNav,
  onDateSet,
  connectionStatus = 'live',
  connectionLabel,
}: HostStandHeaderProps) {
  const router = useRouter();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      setTime(
        new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      );
    };
    update();
    const interval = setInterval(update, 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/host-stand/login');
    router.refresh();
  };

  const formattedDate = new Date(businessDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const statusStyle =
    connectionStatus === 'live'
      ? 'text-emerald-300 border-emerald-700 bg-emerald-900/30'
      : connectionStatus === 'degraded'
        ? 'text-amber-300 border-amber-700 bg-amber-900/30'
        : 'text-red-300 border-red-700 bg-red-900/30';
  const statusText =
    connectionStatus === 'live'
      ? 'Live'
      : connectionStatus === 'degraded'
        ? 'Delayed'
        : 'Offline';

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-[#1C1917] border-b border-gray-800">
      <div className="flex items-center gap-4">
        <span className="text-[#D4622B] font-bold text-lg tracking-tight">KevaOS</span>
        <span className="text-white font-semibold text-lg">{venueName}</span>
      </div>
      <div className="flex items-center gap-6">
        <span className={`text-xs px-2 py-1 rounded border ${statusStyle}`}>
          {statusText}{connectionLabel ? ` - ${connectionLabel}` : ''}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDateNav(-1)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            &#8249;
          </button>
          <button
            onClick={() => dateInputRef.current?.showPicker()}
            className="relative text-white font-medium text-sm min-w-[100px] text-center hover:bg-white/10 px-2 py-1 rounded-lg transition-colors cursor-pointer"
          >
            {formattedDate}
            <input
              ref={dateInputRef}
              type="date"
              value={businessDate}
              onChange={(e) => {
                if (e.target.value) onDateSet(e.target.value);
              }}
              className="absolute inset-0 opacity-0 cursor-pointer"
              tabIndex={-1}
            />
          </button>
          <button
            onClick={() => onDateNav(1)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            &#8250;
          </button>
        </div>
        <span className="text-gray-400 text-lg tabular-nums">{time}</span>
        <span className="text-gray-500 text-sm">{hostName}</span>
        <button
          onClick={handleSignOut}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
