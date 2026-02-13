'use client';

export function BudgetFilters() {
  return (
    <div className="flex gap-4 mb-6">
      <select aria-label="Filter by venue" className="px-3 py-2 text-sm border border-border rounded-md bg-background focus-sage">
        <option>All Venues</option>
        <option>Delilah LA</option>
        <option>Nice Guy LA</option>
      </select>

      <select aria-label="Filter by department" className="px-3 py-2 text-sm border border-border rounded-md bg-background focus-sage">
        <option>All Departments</option>
        <option>Kitchen</option>
        <option>Bar</option>
        <option>FOH</option>
      </select>

      <select aria-label="Filter by time period" className="px-3 py-2 text-sm border border-border rounded-md bg-background focus-sage">
        <option>This Week</option>
        <option>Last Week</option>
        <option>This Month</option>
      </select>
    </div>
  );
}
