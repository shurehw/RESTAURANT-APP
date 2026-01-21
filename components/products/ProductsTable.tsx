'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronLeft, ChevronRight, Edit } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditProductModal } from './EditProductModal';

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  subcategory: string | null;
  base_uom: string;
  gl_account_id: string | null;
  item_pack_configs: Array<{
    pack_type: string;
    units_per_pack: number;
    unit_size: number;
    unit_size_uom: string;
  }>;
}

interface ProductsTableProps {
  initialProducts: Product[];
  totalCount: number;
}

export function ProductsTable({ initialProducts, totalCount }: ProductsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const itemsPerPage = 50;

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

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = filteredProducts.slice(startIndex, endIndex);

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
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {filteredProducts.length} of {totalCount} products
        </div>
      </div>

      {/* Table */}
      <div className="border border-opsos-sage-200 rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Recipe Unit</TableHead>
              <TableHead>Pack Configs</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentProducts.length > 0 ? (
              currentProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{product.sku}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {product.subcategory || product.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{product.base_uom}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {product.item_pack_configs.map((config, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-brass/10 text-brass rounded text-xs font-mono">
                          {config.units_per_pack > 1
                            ? `${config.units_per_pack} × ${config.unit_size}${config.unit_size_uom}`
                            : `${config.unit_size}${config.unit_size_uom}`
                          }
                        </span>
                      ))}
                      {product.item_pack_configs.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedProduct(product)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No products found matching your filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} of {filteredProducts.length}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
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
                    className="w-8 h-8 p-0"
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
