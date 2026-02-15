# Nightly Report Layout Improvements

## Changes to implement:

### 1. Move Food/Bev into Executive Summary Grid
**Current:** Standalone "Summary Stats" section with full Card components
**New:** Simple tiles in Executive Summary grid (after Labor %)

Add after line 1049 (before closing `</div>` of grid):
```tsx
{/* Food Sales */}
{(() => {
  const categories = viewMode === 'nightly'
    ? (report.salesByCategory || [])
    : viewMode === 'wtd'
      ? (factsSummary?.categories_wtd || [])
      : (factsSummary?.categories_ptd || []);

  const isBevCategory = (cat: string) => {
    const lower = (cat || '').toLowerCase();
    return lower.includes('bev') || lower.includes('wine') ||
           lower.includes('beer') || lower.includes('liquor') ||
           lower.includes('cocktail');
  };

  const foodGross = categories
    .filter((c: any) => !isBevCategory(c.category))
    .reduce((sum: number, c: any) => sum + (Number(c.net_sales) || 0), 0);
  const bevGross = categories
    .filter((c: any) => isBevCategory(c.category))
    .reduce((sum: number, c: any) => sum + (Number(c.net_sales) || 0), 0);

  const totalCategoryGross = foodGross + bevGross;
  const foodPct = totalCategoryGross > 0 ? (foodGross / totalCategoryGross * 100) : 0;
  const bevPct = totalCategoryGross > 0 ? (bevGross / totalCategoryGross * 100) : 0;

  const actualNetSales = viewMode === 'nightly'
    ? (report.summary.net_sales || 0)
    : viewMode === 'wtd'
      ? (factsSummary?.variance?.wtd_net_sales || 0)
      : (factsSummary?.variance?.ptd_net_sales || 0);

  const foodSales = actualNetSales * (foodPct / 100);
  const bevSales = actualNetSales * (bevPct / 100);

  return (
    <>
      <div className="space-y-1">
        <div className="text-2xl font-bold tabular-nums">
          {formatCurrency(foodSales)}
        </div>
        <div className="text-xs text-muted-foreground uppercase">Food Sales</div>
        <div className="text-xs text-muted-foreground">
          {foodPct.toFixed(1)}% mix
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-2xl font-bold tabular-nums">
          {formatCurrency(bevSales)}
        </div>
        <div className="text-xs text-muted-foreground uppercase">Bev Sales</div>
        <div className="text-xs text-muted-foreground">
          {bevPct.toFixed(1)}% mix
        </div>
      </div>
    </>
  );
})()}
```

### 2. Remove "Summary Stats - Single Row" section
**Delete lines 1066-1154** (entire section including Avg/Cover, Comp %, Food, Bev cards)

### 3. Update Menu Items section
**Filter to show:**
- Top 5 Food items (by net sales, excluding Service Charge/Other categories)
- Top 5 Beverage items (by net sales)

**Modify around line 1690** (menuItems section):
```tsx
{/* Menu Items - Top 5 Food + Top 5 Bev */}
{(() => {
  const items = viewMode === 'nightly'
    ? report.menuItems
    : viewMode === 'wtd'
      ? (factsSummary?.items_wtd || [])
      : (factsSummary?.items_ptd || []);

  const isBevCategory = (cat: string) => {
    const lower = (cat || '').toLowerCase();
    return lower.includes('bev') || lower.includes('wine') ||
           lower.includes('beer') || lower.includes('liquor') ||
           lower.includes('cocktail') || lower.includes('drink');
  };

  const isExcluded = (cat: string) => {
    const lower = (cat || '').toLowerCase();
    return lower.includes('service charge') ||
           lower.includes('other') ||
           lower === 'other';
  };

  // Filter and sort
  const foodItems = items
    .filter((item: any) => !isBevCategory(item.parent_category) && !isExcluded(item.parent_category))
    .sort((a: any, b: any) => (b.net_total || 0) - (a.net_total || 0))
    .slice(0, 5);

  const bevItems = items
    .filter((item: any) => isBevCategory(item.parent_category))
    .sort((a: any, b: any) => (b.net_total || 0) - (a.net_total || 0))
    .slice(0, 5);

  return (
    <>
      <h3 className="text-sm font-semibold mb-2">Top 5 Food Items</h3>
      <table className="table-opsos">
        {/* render foodItems */}
      </table>

      <h3 className="text-sm font-semibold mt-6 mb-2">Top 5 Beverage Items</h3>
      <table className="table-opsos">
        {/* render bevItems */}
      </table>
    </>
  );
})()}
```

## Summary of Changes:
1. ✅ Food/Bev tiles added to Executive Summary grid
2. ✅ Removed duplicate Summary Stats section
3. ✅ Menu items filtered to top 5 food + top 5 bev
4. ✅ Service charges and "Other" category excluded from menu items
