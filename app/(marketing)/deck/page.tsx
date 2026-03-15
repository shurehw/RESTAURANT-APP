'use client';

import { useState } from 'react';

export default function DeckPage() {
  const [state, setState] = useState<'locked' | 'loading' | 'unlocked' | 'error'>('locked');
  const [password, setPassword] = useState('');
  const [deckHtml, setDeckHtml] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');

    try {
      const res = await fetch('/api/deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const htmlRes = await fetch('/deck.html?v=' + Date.now(), { cache: 'no-store' });
        const html = await htmlRes.text();
        setDeckHtml(html);
        setState('unlocked');
      } else {
        setState('error');
        setTimeout(() => setState('locked'), 2000);
      }
    } catch {
      setState('error');
      setTimeout(() => setState('locked'), 2000);
    }
  }

  if (state === 'unlocked' && deckHtml) {
    return (
      <iframe
        srcDoc={deckHtml}
        className="fixed inset-0 w-full h-full border-0"
        title="KevaOS Pitch Deck"
        allow="fullscreen"
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: '#0A0A0F', fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="w-full max-w-sm px-6">
        <div className="flex flex-col items-center mb-10">
          <svg viewBox="0 0 52 58" className="w-10 h-11 mb-4">
            <rect x="0" y="0" width="12" height="58" rx="2" fill="#D4622B" />
            <polygon points="12,18 52,0 52,12 12,30" fill="#D4622B" />
            <polygon points="12,34 52,46 52,58 12,40" fill="#D4622B" />
          </svg>
          <div className="flex items-baseline gap-0">
            <span className="text-lg font-bold tracking-wider" style={{ color: '#E8E4DD' }}>Keva</span>
            <span className="text-lg tracking-wider" style={{ color: '#D4622B' }}>OS</span>
          </div>
          <p className="text-xs mt-3 tracking-widest uppercase"
            style={{ color: 'rgba(232,228,221,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>
            Confidential
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter access code"
              autoFocus
              className="w-full px-4 py-3 rounded-none text-sm outline-none transition-all"
              style={{
                background: '#111116',
                border: '1px solid rgba(255,255,255,0.06)',
                color: '#E8E4DD',
                fontFamily: "'JetBrains Mono', monospace",
              }}
              onFocus={(e) => e.target.style.borderColor = 'rgba(212,98,43,0.4)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
            />
          </div>
          <button
            type="submit"
            disabled={state === 'loading' || !password}
            className="w-full py-3 text-sm font-semibold tracking-wide uppercase transition-all"
            style={{
              background: state === 'error' ? '#DC2626' : '#D4622B',
              color: '#FFFEFB',
              opacity: state === 'loading' || !password ? 0.5 : 1,
              cursor: state === 'loading' ? 'wait' : 'pointer',
            }}
          >
            {state === 'loading' ? 'Verifying…' : state === 'error' ? 'Invalid Code' : 'View Deck'}
          </button>
        </form>

        <p className="text-center text-xs mt-8" style={{ color: 'rgba(232,228,221,0.2)' }}>
          The Binyan Group &middot; 2026
        </p>
      </div>
    </div>
  );
}
