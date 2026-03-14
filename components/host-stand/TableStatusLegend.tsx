import { STATE_COLORS, STATE_LABELS } from './constants';

export function TableStatusLegend() {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-[#1C1917]/80 rounded-lg">
      {Object.entries(STATE_COLORS).map(([state, color]) => (
        <div key={state} className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs text-gray-400">
            {STATE_LABELS[state as keyof typeof STATE_LABELS]}
          </span>
        </div>
      ))}
    </div>
  );
}
