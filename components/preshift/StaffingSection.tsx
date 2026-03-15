import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

interface StaffingEntry {
  position: string;
  count: number;
  names: string[];
}

interface StaffingSectionProps {
  staffing: StaffingEntry[];
}

function buildSummaryLine(staffing: StaffingEntry[]): string {
  return staffing
    .map((s) => `${s.count} ${s.position.toLowerCase()}${s.count !== 1 ? 's' : ''}`)
    .join(' / ');
}

export function StaffingSection({ staffing }: StaffingSectionProps) {
  if (!staffing || staffing.length === 0) {
    return (
      <Card className="print:border-0 print:shadow-none print:p-0">
        <CardHeader className="pb-3 print:pb-1 print:px-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-brass" />
            Staffing
          </CardTitle>
        </CardHeader>
        <CardContent className="print:px-0">
          <p className="text-sm text-muted-foreground italic">No schedule published</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="print:border-0 print:shadow-none print:p-0">
      <CardHeader className="pb-3 print:pb-1 print:px-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-brass" />
          Staffing
        </CardTitle>
      </CardHeader>
      <CardContent className="print:px-0 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          {buildSummaryLine(staffing)}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 print:grid-cols-4">
          {staffing.map((entry) => (
            <div
              key={entry.position}
              className="rounded-md border border-border p-3 print:border-gray-300"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {entry.position}
              </div>
              <div className="text-lg font-bold text-foreground">{entry.count}</div>
              {entry.names.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {entry.names.map((name) => (
                    <li key={name} className="text-xs text-muted-foreground">
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
