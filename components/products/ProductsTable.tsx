'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronLeft, ChevronRight, Edit, Settings2, Download } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditProductModal } from './EditProductModal';

// Normalize category names for display
function normalizeCategoryName(category: string): string {
  const categoryMap: Record<string, string> = {
    'liquor': 'Liquor',
    'wine': 'Wine',
    'beer': 'Beer',
    'beverage': 'Beer',
    'bar_consumables': 'Bar Consumables',
    'non_alcoholic_beverage': 'Non-Alcoholic Beverage',
    'food': 'Food',
    'produce': 'Produce',
    'meat': 'Meat',
    'seafood': 'Seafood',
    'dairy': 'Dairy',
    'bakery': 'Bakery',
    'grocery': 'Grocery',
    'dry_goods': 'Dry Goods',
    'frozen': 'Frozen',
    'packaging': 'Packaging',
    'disposables': 'Disposables',
    'chemicals': 'Chemicals',
    'smallwares': 'Smallwares',
    'supplies': 'Supplies',
  };
  return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  subcategory: string | null;
  base_uom: string;
  gl_account_id: string | null;
  r365_measure_type: string | null;
  r365_reporting_uom: string | null;
  r365_inventory_uom: string | null;
  r365_cost_account: string | null;
  r365_inventory_account: string | null;
  item_pack_configurations: Array<{
    pack_type: string;
    units_per_pack: number;
    unit_size: number;
    unit_size_uom: string;
    vendor_item_code?: string | null;
  }>;
}

interface ProductsTableProps {
  initialProducts: Product[];
  totalCount: number;
  orgId: string;
}

export function ProductsTable({ initialProducts, totalCount, orgId }: ProductsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof Product | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    sku: true,
    category: true,
    base_uom: true,
    pack_configs: true,
  });
  const [showR365Fields, setShowR365Fields] = useState(false);

  const itemsPerPage = 50;

  const toggleColumn = (column: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/items/export?org_id=${orgId}`);

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `items-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export items');
    }
  };

  // Debug pack configs
  console.log('ProductsTable - First product:', {
    name: initialProducts[0]?.name,
    packConfigs: initialProducts[0]?.item_pack_configurations,
    packCount: initialProducts[0]?.item_pack_configurations?.length
  });

  // Sort function
  const handleSort = (column: keyof Product) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Filter products
  const filteredProducts = initialProducts.filter(product => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.subcategory?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      categoryFilter === 'all' ||
      product.category === categoryFilter ||
      product.subcategory === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // Sort products
  const sortedProducts = sortColumn
    ? [...filteredProducts].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return sortDirection === 'asc' ? comparison : -comparison;
      })
    : filteredProducts;

  // Pagination
  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = sortedProducts.slice(startIndex, endIndex);

  // Get unique categories for filter
  const categories = Array.from(new Set(
    initialProducts.map(p => p.subcategory || p.category).filter(Boolean)
  )).sort();

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search products by name, SKU, or category..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1); // Reset to first page on search
            }}
            className="pl-9"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{normalizeCategoryName(cat)}</option>
          ))}
        </select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-opsos-sage-300">
              <Settings2 className="w-4 h-4 mr-2" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={visibleColumns.name}
              onCheckedChange={() => toggleColumn('name')}
            >
              Product Name
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.sku}
              onCheckedChange={() => toggleColumn('sku')}
            >
              SKU
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.category}
              onCheckedChange={() => toggleColumn('category')}
            >
              Category
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.base_uom}
              onCheckedChange={() => toggleColumn('base_uom')}
            >
              Recipe Unit
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.pack_configs}
              onCheckedChange={() => toggleColumn('pack_configs')}
            >
              Pack Configs
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant={showR365Fields ? "brass" : "outline"}
          size="sm"
          onClick={() => setShowR365Fields(!showR365Fields)}
          className={showR365Fields ? "" : "border-opsos-sage-300"}
        >
          R365 Fields
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="border-opsos-sage-300"
        >
          <Download className="w-4 h-4 mr-2" />
          Export to R365
        </Button>

        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {filteredProducts.length} of {totalCount} products
        </div>
      </div>

      {/* Table */}
      <div className="border border-opsos-sage-200 rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.name && (
                <TableHead
                  className="cursor-pointer hover:bg-opsos-sage-50"
                  onClick={() => handleSort('name')}
                >
                  Product Name {sortColumn === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
              )}
              {visibleColumns.sku && (
                <TableHead
                  className="cursor-pointer hover:bg-opsos-sage-50"
                  onClick={() => handleSort('sku')}
                >
                  SKU {sortColumn === 'sku' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
              )}
              {visibleColumns.category && (
                <TableHead
                  className="cursor-pointer hover:bg-opsos-sage-50"
                  onClick={() => handleSort('category')}
                >
                  Category {sortColumn === 'category' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
              )}
              {visibleColumns.base_uom && (
                <TableHead
                  className="cursor-pointer hover:bg-opsos-sage-50"
                  onClick={() => handleSort('base_uom')}
                >
                  Recipe Unit {sortColumn === 'base_uom' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHead>
              )}
              {visibleColumns.pack_configs && (
                <TableHead>Pack Configs</TableHead>
              )}
              {showR365Fields && (
                <>
                  <TableHead>Subcategory</TableHead>
                  <TableHead>Measure Type</TableHead>
                  <TableHead>Reporting UOM</TableHead>
                  <TableHead>Inventory UOM</TableHead>
                  <TableHead>Cost Account</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentProducts.length > 0 ? (
              currentProducts.map((product) => (
                <TableRow
                  key={product.id}
                  className="cursor-pointer hover:bg-opsos-sage-50"
                  onClick={() => setSelectedProduct(product)}
                >
                  {visibleColumns.name && (
                    <TableCell className="font-medium">{product.name}</TableCell>
                  )}
                  {visibleColumns.sku && (
                    <TableCell className="font-mono text-xs text-muted-foreground">{product.sku}</TableCell>
                  )}
                  {visibleColumns.category && (
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {product.subcategory || normalizeCategoryName(product.category)}
                      </Badge>
                    </TableCell>
                  )}
                  {visibleColumns.base_uom && (
                    <TableCell className="font-mono">{product.base_uom}</TableCell>
                  )}
                  {visibleColumns.pack_configs && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1">
                        {product.item_pack_configurations.map((config, idx) => {
                          // Always show format as "quantity × size unit" for consistency
                          const display = `${config.units_per_pack} × ${config.unit_size}${config.unit_size_uom}`;
                          return (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-brass/10 text-brass rounded text-xs font-mono"
                              title={config.vendor_item_code ? `Vendor SKU: ${config.vendor_item_code}` : undefined}
                            >
                              {display}
                            </span>
                          );
                        })}
                        {product.item_pack_configurations.length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {showR365Fields && (
                    <>
                      <TableCell className="text-xs">{product.subcategory || '—'}</TableCell>
                      <TableCell className="text-xs">{product.r365_measure_type || '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{product.r365_reporting_uom || '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{product.r365_inventory_uom || '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{product.r365_cost_account || '—'}</TableCell>
                    </>
                  )}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={Object.values(visibleColumns).filter(Boolean).length + (showR365Fields ? 5 : 0)}
                  className="text-center py-8 text-muted-foreground"
                >
                  No products found matching your filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border border-opsos-sage-200 rounded-md bg-white">
          <div className="text-sm font-medium text-ledger-black">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} of {filteredProducts.length}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="border-opsos-sage-300"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Show first, last, current, and 2 around current
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <Button
                    key={i}
                    variant={currentPage === pageNum ? "brass" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className={currentPage === pageNum ? "w-9 h-9" : "w-9 h-9 border-opsos-sage-300"}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="border-opsos-sage-300"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {selectedProduct && (
        <EditProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSave={async (updatedProduct) => {
            // Call API to update product
            const response = await fetch(`/api/items/${updatedProduct.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedProduct),
            });

            if (!response.ok) {
              throw new Error('Failed to update product');
            }

            // Refresh the page to show updated data
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
