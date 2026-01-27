"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface BulkReviewFiltersProps {
  vendors: { id: string; name: string }[];
  currentVendor: string;
  currentSort: string;
  currentSearch: string;
  currentHasCode?: string;
  limit: number;
}

export function BulkReviewFilters({
  vendors,
  currentVendor,
  currentSort,
  currentSearch,
  currentHasCode,
  limit,
}: BulkReviewFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilters = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      
      // Reset to page 1 when filters change
      params.set("page", "1");
      params.set("limit", String(limit));
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      router.push(`/invoices/bulk-review?${params.toString()}`);
    },
    [router, searchParams, limit]
  );

  const clearFilters = () => {
    router.push(`/invoices/bulk-review?limit=${limit}`);
  };

  const hasActiveFilters = currentVendor || currentSearch || currentHasCode || currentSort !== "date_desc";

  return (
    <Card className="p-4 mb-6">
      <div className="flex flex-wrap items-end gap-4">
        {/* Vendor Filter */}
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs text-muted-foreground mb-1 block">Vendor</Label>
          <Select
            value={currentVendor || "all"}
            onValueChange={(value) => updateFilters({ vendor: value === "all" ? undefined : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Has Vendor Code Filter */}
        <div className="min-w-[180px]">
          <Label className="text-xs text-muted-foreground mb-1 block">Vendor Code</Label>
          <Select
            value={currentHasCode || "all"}
            onValueChange={(value) => updateFilters({ hasCode: value === "all" ? undefined : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              <SelectItem value="true">Has vendor code</SelectItem>
              <SelectItem value="false">No vendor code</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort */}
        <div className="min-w-[180px]">
          <Label className="text-xs text-muted-foreground mb-1 block">Sort by</Label>
          <Select
            value={currentSort}
            onValueChange={(value) => updateFilters({ sort: value === "date_desc" ? undefined : value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest first</SelectItem>
              <SelectItem value="date_asc">Oldest first</SelectItem>
              <SelectItem value="vendor_asc">Vendor A-Z</SelectItem>
              <SelectItem value="description_asc">Description A-Z</SelectItem>
              <SelectItem value="description_desc">Description Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs text-muted-foreground mb-1 block">Search description</Label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const search = formData.get("search") as string;
              updateFilters({ search: search || undefined });
            }}
            className="flex gap-2"
          >
            <Input
              name="search"
              placeholder="Search..."
              defaultValue={currentSearch}
              className="flex-1"
            />
            <Button type="submit" size="icon" variant="secondary">
              <Search className="w-4 h-4" />
            </Button>
          </form>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </Card>
  );
}
