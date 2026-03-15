import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Music, PartyPopper } from 'lucide-react';

interface LargePartyEntry {
  time: string;
  party_size: number;
  name: string;
  notes: string | null;
  min_spend: number | null;
}

interface EventsSectionProps {
  largeParties: LargePartyEntry[];
  events: any;
  entertainment: any;
}

function formatCurrency(v: number): string {
  return `$${v.toLocaleString()}`;
}

export function EventsSection({
  largeParties,
  events,
  entertainment,
}: EventsSectionProps) {
  const hasLargeParties = largeParties && largeParties.length > 0;
  const hasEvents = events && (Array.isArray(events) ? events.length > 0 : true);
  const hasEntertainment =
    entertainment && (Array.isArray(entertainment) ? entertainment.length > 0 : true);

  if (!hasLargeParties && !hasEvents && !hasEntertainment) {
    return null;
  }

  return (
    <Card className="print:border-0 print:shadow-none print:p-0">
      <CardHeader className="pb-3 print:pb-1 print:px-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-brass" />
          Events &amp; Large Parties
        </CardTitle>
      </CardHeader>
      <CardContent className="print:px-0 space-y-4">
        {/* Large Party Dining */}
        {hasLargeParties && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Large Parties
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border print:border-gray-400">
                    <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Time
                    </th>
                    <th className="text-center py-2 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Covers
                    </th>
                    <th className="text-left py-2 pl-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {largeParties.map((lp, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 print:border-gray-200 last:border-b-0"
                    >
                      <td className="py-2 pr-4 font-medium whitespace-nowrap">{lp.time}</td>
                      <td className="py-2 px-4 text-center">{lp.party_size}</td>
                      <td className="py-2 pl-4">
                        <span className="font-medium">{lp.name}</span>
                        {lp.min_spend != null && (
                          <span className="ml-2 text-xs text-brass font-medium">
                            Min {formatCurrency(lp.min_spend)}
                          </span>
                        )}
                        {lp.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{lp.notes}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tripleseat Events */}
        {hasEvents && (
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              <PartyPopper className="h-3.5 w-3.5" />
              Private Events
            </h4>
            {Array.isArray(events) ? (
              <div className="space-y-2">
                {events.map((evt: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border border-border p-3 print:border-gray-300"
                  >
                    <div>
                      <p className="font-medium text-sm">{evt.name || evt.event_name || 'Event'}</p>
                      {evt.type && (
                        <p className="text-xs text-muted-foreground">{evt.type}</p>
                      )}
                    </div>
                    {evt.guest_count != null && (
                      <Badge variant="outline">{evt.guest_count} guests</Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground">{String(events)}</p>
            )}
          </div>
        )}

        {/* Entertainment */}
        {hasEntertainment && (
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              <Music className="h-3.5 w-3.5" />
              Entertainment Tonight
            </h4>
            {Array.isArray(entertainment) ? (
              <div className="space-y-2">
                {entertainment.map((ent: any, i: number) => (
                  <div
                    key={i}
                    className="rounded-md border border-border p-3 print:border-gray-300"
                  >
                    <p className="font-medium text-sm">
                      {ent.name || ent.artist || ent.act || String(ent)}
                    </p>
                    {ent.time && (
                      <p className="text-xs text-muted-foreground">{ent.time}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground">{String(entertainment)}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
