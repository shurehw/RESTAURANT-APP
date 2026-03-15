'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, RefreshCw, Users, ChevronLeft, ChevronRight, Lock } from 'lucide-react';

interface PreshiftHeaderProps {
  venueName: string;
  date: string;
  coversForecast: number | null;
  onPrint: () => void;
  onRefresh?: () => void;
  onDateChange: (date: string) => void;
  isToday: boolean;
  readonly?: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export function PreshiftHeader({
  venueName,
  date,
  coversForecast,
  onPrint,
  onRefresh,
  onDateChange,
  isToday,
  readonly,
}: PreshiftHeaderProps) {
  return (
    <div className="flex flex-col gap-3 pb-4 border-b border-border print:border-b-0">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight uppercase text-foreground">
            {venueName}
          </h1>
          <p className="text-sm text-muted-foreground print:text-foreground">
            {formatDate(date)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {coversForecast != null && (
            <Badge variant="brass" className="text-sm px-3 py-1 gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {coversForecast} COVERS
            </Badge>
          )}

          {readonly && (
            <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
              <Lock className="h-3 w-3" />
              View Only
            </Badge>
          )}

          <div className="flex items-center gap-2 print:hidden">
            {onRefresh && (
              <Button variant="outline" size="icon" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Printer className="h-4 w-4 mr-1.5" />
              Print
            </Button>
          </div>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-1 print:hidden">
        <div className="flex items-center gap-1 bg-card border border-border rounded-md p-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDateChange(shiftDate(date, -1))}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="bg-transparent border-none text-sm font-medium px-2 focus:outline-none"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDateChange(shiftDate(date, 1))}
            className="h-8 w-8"
            disabled={isToday}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isToday && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              const now = new Date();
              if (now.getHours() < 5) now.setDate(now.getDate() - 1);
              onDateChange(now.toISOString().split('T')[0]);
            }}
          >
            Today
          </Button>
        )}
      </div>
    </div>
  );
}
