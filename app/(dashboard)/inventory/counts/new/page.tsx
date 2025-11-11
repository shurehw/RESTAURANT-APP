/**
 * New Inventory Count
 * Entry form for physical inventory counting
 */

import { InventoryCountForm } from '@/components/inventory/InventoryCountForm';

export default function NewInventoryCountPage() {
  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="page-header">New Inventory Count</h1>
        <p className="text-muted-foreground">
          Enter physical inventory quantities for variance analysis
        </p>
      </div>

      <InventoryCountForm />
    </div>
  );
}
