'use client';

interface PeriodDayRow {
  business_date: string;
  net_sales: number;
  covers_count: number;
  prior_net_sales: number | null;
  prior_covers: number | null;
}

const fmtCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

function getDayLabel(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export function PeriodDayChart({ days }: { days: PeriodDayRow[] }) {
  if (days.length === 0) return null;

  const maxValue = Math.max(
    ...days.map(d => Math.max(d.net_sales, d.prior_net_sales || 0)),
    1
  );

  const barWidth = Math.max(16, Math.min(40, Math.floor(500 / days.length)));

  return (
    <div className="space-y-3">
      {/* Bars */}
      <div className="flex items-end gap-1 h-40 overflow-x-auto">
        {days.map((day) => {
          const currentPct = (day.net_sales / maxValue) * 100;
          const priorPct = day.prior_net_sales ? (day.prior_net_sales / maxValue) * 100 : 0;

          return (
            <div key={day.business_date} className="flex flex-col items-center gap-px" style={{ minWidth: barWidth * 2 + 4 }}>
              <div className="flex items-end gap-px" style={{ height: '100%' }}>
                {/* Prior bar */}
                <div
                  className="bg-muted-foreground/20 rounded-t transition-all"
                  style={{ width: barWidth, height: `${priorPct}%`, minHeight: priorPct > 0 ? 2 : 0 }}
                  title={`Prior: ${day.prior_net_sales != null ? fmtCurrency(day.prior_net_sales) : 'N/A'}`}
                />
                {/* Current bar */}
                <div
                  className="bg-emerald-500 rounded-t transition-all"
                  style={{ width: barWidth, height: `${currentPct}%`, minHeight: currentPct > 0 ? 2 : 0 }}
                  title={`${getDayLabel(day.business_date)}: ${fmtCurrency(day.net_sales)}`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground mt-1">{getDayLabel(day.business_date)}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
          <span>Current</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-muted-foreground/20" />
          <span>Prior</span>
        </div>
      </div>
    </div>
  );
}
