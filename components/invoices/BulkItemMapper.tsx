"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

interface BulkItemMapperProps {
  lines: any[];
  vendorId: string;
}

export function BulkItemMapper({ lines, vendorId }: BulkItemMapperProps) {
  const router = useRouter();
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<Record<string, any[]>>({});
  const [isSearching, setIsSearching] = useState<Record<string, boolean>>({});
  const [selectedItems, setSelectedItems] = useState<Record<string, string>>({});

  const handleSearch = async (lineId: string, query: string) => {
    if (!query.trim()) return;

    setIsSearching({ ...isSearching, [lineId]: true });

    try {
      const response = await fetch(
        `/api/items/search?q=${encodeURIComponent(query)}&vendor_id=${vendorId}`
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults({ ...searchResults, [lineId]: data.items || [] });
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching({ ...isSearching, [lineId]: false });
    }
  };

  const handleSelectItem = (lineId: string, itemId: string) => {
    setSelectedItems({ ...selectedItems, [lineId]: itemId });
  };

  const handleMapItem = async (lineId: string, itemId: string) => {
    try {
      const response = await fetch(`/api/invoice-lines/${lineId}/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error("Error mapping item:", error);
    }
  };

  const handleBulkMap = async () => {
    const mappings = Object.entries(selectedItems);

    for (const [lineId, itemId] of mappings) {
      await handleMapItem(lineId, itemId);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b bg-muted flex items-center justify-between">
        <h3 className="font-semibold">Bulk Mapping View</h3>
        {Object.keys(selectedItems).length > 0 && (
          <Button onClick={handleBulkMap} size="sm" variant="brass">
            <Check className="w-4 h-4 mr-2" />
            Map {Object.keys(selectedItems).length} Items
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold w-1/3">Invoice Description</th>
              <th className="px-4 py-3 text-left text-xs font-semibold">Qty</th>
              <th className="px-4 py-3 text-left text-xs font-semibold">Price</th>
              <th className="px-4 py-3 text-left text-xs font-semibold w-1/2">Search & Map</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const results = searchResults[line.id] || [];
              const selected = selectedItems[line.id];
              const query = searchQueries[line.id] || "";

              return (
                <tr key={line.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm align-top">
                    <div className="font-medium">{line.description}</div>
                  </td>
                  <td className="px-4 py-3 text-sm align-top font-mono">
                    {line.qty}
                  </td>
                  <td className="px-4 py-3 text-sm align-top font-mono">
                    ${line.unit_cost?.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-2">
                      {/* Search Input */}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            type="text"
                            placeholder="Search items..."
                            value={query}
                            onChange={(e) => {
                              const newQuery = e.target.value;
                              setSearchQueries({ ...searchQueries, [line.id]: newQuery });
                              if (newQuery.length >= 2) {
                                handleSearch(line.id, newQuery);
                              }
                            }}
                            className="pl-9 text-sm"
                          />
                        </div>
                      </div>

                      {/* Search Results */}
                      {results.length > 0 && (
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {results.slice(0, 5).map((item) => (
                            <div
                              key={item.id}
                              className={`flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50 ${
                                selected === item.id ? "border-brass bg-brass/5" : "border-border"
                              }`}
                              onClick={() => handleSelectItem(line.id, item.id)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{item.name}</div>
                                <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                              </div>
                              {selected === item.id && (
                                <Check className="w-4 h-4 text-brass ml-2 flex-shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Selected Item Display */}
                      {selected && (
                        <div className="pt-2 border-t">
                          <Badge variant="sage" className="text-xs">
                            Selected: {results.find(r => r.id === selected)?.name}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
