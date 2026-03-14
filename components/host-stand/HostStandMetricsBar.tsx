'use client';

interface HostStandMetricsBarProps {
  totalCovers: number;
  available: number;
  totalTables: number;
  avgTurnMinutes: number;
  waitlistCount: number;
  totalRevenue: number;
}

export function HostStandMetricsBar({
  totalCovers,
  available,
  totalTables,
  avgTurnMinutes,
  waitlistCount,
  totalRevenue,
}: HostStandMetricsBarProps) {
  return (
    <div className="flex items-center justify-around px-6 py-3 bg-[#1C1917] border-t border-gray-800">
      <Metric label="Covers" value={totalCovers} />
      <Divider />
      <Metric label="Available" value={`${available}/${totalTables}`} />
      <Divider />
      <Metric label="Avg Turn" value={avgTurnMinutes > 0 ? `${avgTurnMinutes}m` : '—'} />
      <Divider />
      <Metric label="Waitlist" value={waitlistCount} highlight={waitlistCount > 0} />
      <Divider />
      <Metric label="Revenue" value={`$${totalRevenue.toLocaleString()}`} />
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <div
        className={`text-xl font-bold tabular-nums ${
          highlight ? 'text-[#D4622B]' : 'text-white'
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-8 bg-gray-800" />;
}
