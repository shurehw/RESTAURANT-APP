'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html>
      <body>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            background: '#f5f1e8',
            color: '#1f2937',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ maxWidth: '32rem', textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              An unexpected application error occurred. Try again, and if the issue persists,
              investigate the latest server logs.
            </p>
            <button
              onClick={reset}
              style={{
                padding: '0.7rem 1rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: '#b45309',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
