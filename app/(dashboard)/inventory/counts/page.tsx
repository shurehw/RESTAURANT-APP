/**
 * Inventory Counts List
 * Shows all inventory count sessions
 */

import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, CheckCircle, Clock } from 'lucide-react';

export default async function InventoryCountsPage() {
  const supabase = await createClient();

  const { data: counts } = await supabase
    .from('inventory_counts')
    .select('*')
    .order('count_date', { ascending: false })
    .limit(50);

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="page-header">Inventory Counts</h1>
          <p className="text-muted-foreground">
            Physical inventory tracking and variance analysis
          </p>
        </div>
        <Button variant="brass" asChild>
          <a href="/inventory/counts/new">
            <Plus className="w-4 h-4 mr-2" />
            New Count
          </a>
        </Button>
      </div>

      {/* Counts List */}
      <Card className="p-6">
        {!counts || counts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="mb-2">No inventory counts yet</p>
            <p className="text-sm">Start your first count to track inventory levels</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-sm text-muted-foreground border-b">
                <tr>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Counted By</th>
                  <th className="pb-3 font-medium">Items</th>
                  <th className="pb-3 font-medium text-right">Total Value</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {counts.map((count) => (
                  <tr key={count.id} className="border-b hover:bg-muted/50">
                    <td className="py-3">
                      {new Date(count.count_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="py-3">
                      <Badge variant="outline">
                        {count.count_type.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-3">
                      {count.status === 'completed' && (
                        <Badge variant="sage" className="gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Completed
                        </Badge>
                      )}
                      {count.status === 'approved' && (
                        <Badge variant="sage" className="gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Approved
                        </Badge>
                      )}
                      {count.status === 'in_progress' && (
                        <Badge variant="outline" className="gap-1">
                          <Clock className="w-3 h-3" />
                          In Progress
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {count.counted_by || '—'}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      —
                    </td>
                    <td className="py-3 text-right font-mono">
                      —
                    </td>
                    <td className="py-3 text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/inventory/counts/${count.id}`}>
                          View
                        </a>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
