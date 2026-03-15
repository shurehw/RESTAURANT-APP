import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown } from 'lucide-react';

interface VipEntry {
  time: string;
  party_size: number;
  name: string;
  notes: string | null;
  client_requests: string | null;
  min_spend: number | null;
  tags: unknown[];
}

interface VipTableProps {
  vips: VipEntry[];
}

function formatCurrency(v: number): string {
  return `$${v.toLocaleString()}`;
}

export function VipTable({ vips }: VipTableProps) {
  if (!vips || vips.length === 0) {
    return (
      <Card className="print:border-0 print:shadow-none print:p-0">
        <CardHeader className="pb-3 print:pb-1 print:px-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4 text-brass" />
            VIP Reservations
          </CardTitle>
        </CardHeader>
        <CardContent className="print:px-0">
          <p className="text-sm text-muted-foreground italic">No VIP reservations tonight</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="print:border-0 print:shadow-none print:p-0">
      <CardHeader className="pb-3 print:pb-1 print:px-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Crown className="h-4 w-4 text-brass" />
          VIP Reservations
          <Badge variant="brass" className="ml-1">{vips.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="print:px-0">
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
              {vips.map((vip, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 print:border-gray-200 last:border-b-0"
                >
                  <td className="py-2 pr-4 font-medium whitespace-nowrap">{vip.time}</td>
                  <td className="py-2 px-4 text-center">{vip.party_size}</td>
                  <td className="py-2 pl-4">
                    <div className="space-y-0.5">
                      <span className="font-medium">{vip.name}</span>
                      {vip.min_spend != null && (
                        <span className="ml-2 text-xs text-brass font-medium">
                          Min {formatCurrency(vip.min_spend)}
                        </span>
                      )}
                      {(vip.notes || vip.client_requests) && (
                        <p className="text-xs text-muted-foreground">
                          {[vip.notes, vip.client_requests].filter(Boolean).join(' | ')}
                        </p>
                      )}
                      {vip.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {vip.tags.map((tag, ti) => (
                            <Badge key={ti} variant="outline" className="text-[10px] px-1.5 py-0">
                              {String(tag)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
