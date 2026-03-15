import { Badge } from '@/components/ui/badge';
import { Flame, Snowflake, CalendarCheck, PartyPopper } from 'lucide-react';

interface DemandData {
  narrative: string | null;
  is_holiday: boolean;
  holiday_name: string | null;
  has_private_event: boolean;
  private_event_type: string | null;
  demand_multiplier: number;
}

interface DemandBannerProps {
  demand: DemandData;
}

function bannerStyles(multiplier: number) {
  if (multiplier > 1.2) {
    return {
      bg: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900',
      text: 'text-red-800 dark:text-red-200',
      icon: <Flame className="h-4 w-4 text-red-600" />,
      label: 'High Demand',
    };
  }
  if (multiplier < 0.8) {
    return {
      bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900',
      text: 'text-blue-800 dark:text-blue-200',
      icon: <Snowflake className="h-4 w-4 text-blue-600" />,
      label: 'Quiet Night',
    };
  }
  return {
    bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900',
    text: 'text-emerald-800 dark:text-emerald-200',
    icon: <CalendarCheck className="h-4 w-4 text-emerald-600" />,
    label: 'Normal Demand',
  };
}

export function DemandBanner({ demand }: DemandBannerProps) {
  const styles = bannerStyles(demand.demand_multiplier);

  return (
    <div
      className={`rounded-md border p-4 print:border-gray-300 ${styles.bg}`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        {styles.icon}
        <span className={`font-semibold text-sm ${styles.text}`}>{styles.label}</span>

        {demand.is_holiday && demand.holiday_name && (
          <Badge variant="brass" className="gap-1">
            <CalendarCheck className="h-3 w-3" />
            {demand.holiday_name}
          </Badge>
        )}

        {demand.has_private_event && (
          <Badge variant="sage" className="gap-1">
            <PartyPopper className="h-3 w-3" />
            {demand.private_event_type || 'Private Event'}
          </Badge>
        )}

        <span className="text-xs text-muted-foreground">
          {demand.demand_multiplier.toFixed(1)}x
        </span>
      </div>

      {demand.narrative && (
        <p className={`mt-2 text-sm ${styles.text}`}>{demand.narrative}</p>
      )}
    </div>
  );
}
