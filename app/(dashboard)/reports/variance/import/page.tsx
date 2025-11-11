/**
 * POS Sales Import Page
 * Upload CSV from POS system (Toast, Square, Clover, etc.)
 */

import { Card } from '@/components/ui/card';
import { POSImportForm } from '@/components/reports/POSImportForm';

export default function POSImportPage() {
  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="page-header">Import POS Sales</h1>
        <p className="text-muted-foreground">
          Upload daily sales data from your POS system
        </p>
      </div>

      {/* Instructions */}
      <Card className="p-6 mb-6">
        <h3 className="font-semibold mb-3">CSV Format Requirements</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Your CSV file should include the following columns:
        </p>
        <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
          <li><strong>date</strong> - Sale date (YYYY-MM-DD or MM/DD/YYYY)</li>
          <li><strong>item_code</strong> or <strong>sku</strong> or <strong>plu</strong> - POS item identifier</li>
          <li><strong>item_name</strong> - Menu item name</li>
          <li><strong>category</strong> (optional) - POS category (e.g., "Entrees", "Beer", "Cocktails")</li>
          <li><strong>quantity</strong> - Items sold</li>
          <li><strong>net_sales</strong> - Net sales amount (after discounts)</li>
          <li><strong>gross_sales</strong> (optional) - Gross sales amount</li>
        </ul>
      </Card>

      {/* Import Form */}
      <POSImportForm />

      {/* POS System Examples */}
      <Card className="p-6 mt-6">
        <h3 className="font-semibold mb-3">POS System Export Instructions</h3>
        <div className="space-y-4 text-sm">
          <div>
            <h4 className="font-medium mb-1">Toast POS</h4>
            <p className="text-muted-foreground">
              Reports → Sales Summary → Item Sales → Export → CSV
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">Square</h4>
            <p className="text-muted-foreground">
              Reports → Items → Item Sales → Export → Download CSV
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">Clover</h4>
            <p className="text-muted-foreground">
              Reports → Items → Items Report → Export
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
