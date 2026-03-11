'use client';

import { useState, useEffect } from 'react';
import type { VenueTable } from '@/lib/database/floor-plan';

interface TurnProgressRingProps {
  seatedAt: string;
  expectedClear?: string | null;
  shape: VenueTable['shape'];
}

const DEFAULT_TURN_MS = 90 * 60_000; // 90 minutes

/**
 * SVG progress ring showing elapsed turn time.
 * Green → amber → red as time advances past expected duration.
 * Updates every 10s for smooth visual feedback between 30s data polls.
 */
export function TurnProgressRing({ seatedAt, expectedClear, shape }: TurnProgressRingProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, []);

  const startMs = new Date(seatedAt).getTime();
  const expectedMs = expectedClear
    ? new Date(expectedClear).getTime() - startMs
    : DEFAULT_TURN_MS;

  const elapsed = now - startMs;
  const progress = Math.min(elapsed / expectedMs, 1.3); // cap at 130%

  // Color interpolation: green → amber → red
  const color = progress <= 0.7
    ? '#10B981'  // green
    : progress <= 1.0
      ? '#F59E0B' // amber
      : '#EF4444'; // red (overtime)

  const isRound = shape === 'round' || shape === 'oval' || shape === 'bar_seat';
  const size = 100;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(progress, 1));

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      viewBox={`0 0 ${size} ${size}`}
      style={{
        width: '100%',
        height: '100%',
        zIndex: 12,
        transform: 'rotate(-90deg)',
      }}
    >
      {/* Track (faint ring) */}
      {isRound ? (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
      ) : (
        <rect
          x={strokeWidth / 2}
          y={strokeWidth / 2}
          width={size - strokeWidth}
          height={size - strokeWidth}
          rx={8}
          ry={8}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
      )}

      {/* Progress arc */}
      {isRound ? (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease',
            filter: `drop-shadow(0 0 3px ${color}80)`,
          }}
        />
      ) : (
        (() => {
          // For rectangles, calculate perimeter-based progress
          const w = size - strokeWidth;
          const h = size - strokeWidth;
          const perimeter = 2 * (w + h);
          const rectOffset = perimeter * (1 - Math.min(progress, 1));
          return (
            <rect
              x={strokeWidth / 2}
              y={strokeWidth / 2}
              width={w}
              height={h}
              rx={8}
              ry={8}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={perimeter}
              strokeDashoffset={rectOffset}
              strokeLinecap="round"
              style={{
                transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease',
                filter: `drop-shadow(0 0 3px ${color}80)`,
              }}
            />
          );
        })()
      )}
    </svg>
  );
}
