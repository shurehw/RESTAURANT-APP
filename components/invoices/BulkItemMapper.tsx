"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Check, Plus, Sparkles } from "lucide-react";
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
  const [selectedItems, setSelectedItems] = useState<Record<string, string | 'CREATE_NEW'>>({});
  const [recommendedMatches, setRecommendedMatches] = useState<Record<string, any>>({});

  // Load recommended matches on mount
  useEffect(() => {
    lines.forEach((line) => {
      if (line.ocr_raw_data?.recommendedItem) {
        setRecommendedMatches((prev) => ({
          ...prev,
          [line.id]: line.ocr_raw_data.recommendedItem,
        }));
        // Auto-select recommended match
        setSelectedItems((prev) => ({
          ...prev,
          [line.id]: line.ocr_raw_data.recommendedItem.id,
        }));
      }
    });
  }, [lines]);

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

  const handleMapItem = async (lineId: string, itemId: string | 'CREATE_NEW') => {
    if (itemId === 'CREATE_NEW') {
      // Redirect to create new item flow
      const line = lines.find((l) => l.id === lineId);
      if (line) {
        router.push(`/items/new?description=${encodeURIComponent(line.description)}&vendor_id=${vendorId}&line_id=${lineId}`);
      }
      return;
    }

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
    const mappings = Object.entries(selectedItems).filter(([_, itemId]) => itemId !== 'CREATE_NEW');
    const createNewItems = Object.entries(selectedItems).filter(([_, itemId]) => itemId === 'CREATE_NEW');

    // Map existing items
    for (const [lineId, itemId] of mappings) {
      await handleMapItem(lineId, itemId as string);
    }

    // Handle create new separately (redirect for first one)
    if (createNewItems.length > 0) {
      const [lineId] = createNewItems[0];
      await handleMapItem(lineId, 'CREATE_NEW');
    }
  };

  return (
    <Card className="overflow-hidden">
      {Object.keys(selectedItems).length > 0 && (
        <div className="p-4 border-b bg-muted flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {Object.keys(selectedItems).length} item{Object.keys(selectedItems).length > 1 ? 's' : ''} selected
          </div>
          <Button onClick={handleBulkMap} size="sm" variant="brass">
            <Check className="w-4 h-4 mr-2" />
            Map {Object.keys(selectedItems).length} Items
          </Button>
        </div>
      )}

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
              const recommended = recommendedMatches[line.id];
              const selected = selectedItems[line.id];
              const query = searchQueries[line.id] || "";

              return (
                <tr key={line.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm align-top">
                    <div className="font-medium">{line.description}</div>
                    {line.vendor_item_code && (
                      <div className="text-xs text-muted-foreground font-mono mt-1">
                        Code: {line.vendor_item_code}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm align-top font-mono">
                    {line.qty}
                  </td>
                  <td className="px-4 py-3 text-sm align-top font-mono">
                    ${line.unit_cost?.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-2">
                      {/* Recommended Match */}
                      {recommended && (
                        <div
                          className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer ${
                            selected === recommended.id
                              ? "border-brass bg-brass/10"
                              : "border-brass/30 bg-brass/5 hover:border-brass/50"
                          }`}
                          onClick={() => handleSelectItem(line.id, recommended.id)}
                        >
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <Sparkles className="w-4 h-4 text-brass mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold truncate">{recommended.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">{recommended.sku}</div>
                              <Badge variant="outline" className="text-xs mt-1 border-brass/50 text-brass">
                                Recommended Match
                              </Badge>
                            </div>
                          </div>
                          {selected === recommended.id && (
                            <Check className="w-5 h-5 text-brass ml-2 flex-shrink-0" />
                          )}
                        </div>
                      )}

                      {/* Search Input */}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            type="text"
                            placeholder="Search for different item..."
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
                        <div className="space-y-1 max-h-32 overflow-y-auto border rounded-lg p-2 bg-background">
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

                      {/* Create New Item Option */}
                      <div
                        className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50 ${
                          selected === 'CREATE_NEW' ? "border-brass bg-brass/5" : "border-dashed border-border"
                        }`}
                        onClick={() => handleSelectItem(line.id, 'CREATE_NEW')}
                      >
                        <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="text-sm text-muted-foreground">
                          Create new item mapping
                        </div>
                        {selected === 'CREATE_NEW' && (
                          <Check className="w-4 h-4 text-brass ml-auto flex-shrink-0" />
                        )}
                      </div>
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
