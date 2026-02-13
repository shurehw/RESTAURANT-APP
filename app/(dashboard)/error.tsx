'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <AlertTriangle className="w-12 h-12 text-brass mb-4" />
      <h2 className="text-xl font-semibold text-opsos-slate-800 mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-opsos-slate-500 max-w-md mb-6">
        An unexpected error occurred. Please try again or contact support if the
        problem persists.
      </p>
      <button
        onClick={reset}
        className="px-5 py-2 text-sm font-semibold rounded-md bg-brass text-white hover:bg-brass-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
