'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createClient } from '@/lib/supabase/client';
import { Package, Settings, History, X, Plus, Pencil, Trash2 } from 'lucide-react';

interface ItemDetailsModalProps {
  itemId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

interface ItemDetails {
  id: string;
  name: string;
  sku: string;
  category: string;
  subcategory: string;
  base_uom: string;
  organization_id: string;
}

interface PackConfig {
  id: string;
  pack_type: string;
  units_per_pack: number;
  unit_size: number;
  unit_size_uom: string;
  conversion_factor: number;
  display_name: string;
  is_active: boolean;
}

interface ItemPar {
  id: string;
  venue_id: string;
  venue_name?: string;
  par_level: number;
  reorder_point: number;
  reorder_quantity: number | null;
  max_level: number | null;
}

export function ItemDetailsModal({ itemId, isOpen, onClose, onUpdate }: ItemDetailsModalProps) {
  const [item, setItem] = useState<ItemDetails | null>(null);
  const [packConfigs, setPackConfigs] = useState<PackConfig[]>([]);
  const [pars, setPars] = useState<ItemPar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPar, setEditingPar] = useState<string | null>(null);
  const [editingPack, setEditingPack] = useState<string | null>(null);

  useEffect(() => {
    if (itemId && isOpen) {
      loadItemDetails();
    }
  }, [itemId, isOpen]);

  const loadItemDetails = async () => {
    if (!itemId) return;
    setIsLoading(true);
    const supabase = createClient();

    try {
      // Load item details
      const { data: itemData, error: itemError } = await supabase
        .from('items')
        .select('id, name, sku, category, subcategory, base_uom, organization_id')
        .eq('id', itemId)
        .single();

      if (itemError) throw itemError;
      setItem(itemData);

      // Load pack configurations
      const { data: packData, error: packError } = await supabase
        .from('item_pack_configurations')
        .select('*')
        .eq('item_id', itemId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!packError && packData) {
        setPackConfigs(packData);
      }

      // Load pars with venue names
      const { data: parData, error: parError } = await supabase
        .from('item_pars')
        .select('*, venues(name)')
        .eq('item_id', itemId);

      if (!parError && parData) {
        setPars(
          parData.map((p: any) => ({
            ...p,
            venue_name: p.venues?.name || 'Unknown Venue',
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load item details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateBaseUom = async (newUom: string) => {
    if (!item) return;
    setIsSaving(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('items')
        .update({ base_uom: newUom.toLowerCase() })
        .eq('id', item.id);

      if (error) throw error;
      setItem({ ...item, base_uom: newUom.toLowerCase() });
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update base UOM:', error);
      alert('Failed to update unit');
    } finally {
      setIsSaving(false);
    }
  };

  const updatePar = async (parId: string, updates: Partial<ItemPar>) => {
    setIsSaving(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('item_pars')
        .update(updates)
        .eq('id', parId);

      if (error) throw error;

      setPars(pars.map((p) => (p.id === parId ? { ...p, ...updates } : p)));
      setEditingPar(null);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update par:', error);
      alert('Failed to update par level');
    } finally {
      setIsSaving(false);
    }
  };

  const deletePar = async (parId: string) => {
    if (!confirm('Delete this par level?')) return;
    const supabase = createClient();

    try {
      const { error } = await supabase.from('item_pars').delete().eq('id', parId);
      if (error) throw error;
      setPars(pars.filter((p) => p.id !== parId));
      onUpdate?.();
    } catch (error) {
      console.error('Failed to delete par:', error);
      alert('Failed to delete par level');
    }
  };

  const deletePackConfig = async (packId: string) => {
    if (!confirm('Delete this pack configuration?')) return;
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('item_pack_configurations')
        .update({ is_active: false })
        .eq('id', packId);

      if (error) throw error;
      setPackConfigs(packConfigs.filter((p) => p.id !== packId));
      onUpdate?.();
    } catch (error) {
      console.error('Failed to delete pack config:', error);
      alert('Failed to delete pack configuration');
    }
  };

  if (!item) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl">
          <div className="p-8 text-center text-muted-foreground">
            {isLoading ? 'Loading...' : 'Item not found'}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-brass" />
            {item.name}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs font-mono">
              {item.sku}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {item.subcategory || item.category}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="packs">Pack Sizes</TabsTrigger>
            <TabsTrigger value="pars">Par Levels</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-4">
            <div className="space-y-2">
              <Label>Recipe Unit (Base UOM)</Label>
              <div className="flex gap-2">
                <Input
                  value={item.base_uom}
                  onChange={(e) => setItem({ ...item, base_uom: e.target.value })}
                  className="flex-1 font-mono"
                  placeholder="e.g., oz, lb, ea"
                />
                <Button
                  onClick={() => updateBaseUom(item.base_uom)}
                  disabled={isSaving}
                  size="sm"
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The unit used in recipes (e.g., oz for liquids, lb for produce, ea for items)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <Label className="text-xs text-muted-foreground">SKU</Label>
                <div className="font-mono text-sm">{item.sku}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Category</Label>
                <div className="text-sm">{item.subcategory || item.category}</div>
              </div>
            </div>
          </TabsContent>

          {/* Pack Sizes Tab */}
          <TabsContent value="packs" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Track different purchasing configurations (cases, bottles, bags)
              </p>
              <Button size="sm" variant="outline" disabled>
                <Plus className="w-4 h-4 mr-1" />
                Add Pack
              </Button>
            </div>

            {packConfigs.length === 0 ? (
              <div className="p-8 text-center border border-dashed rounded-md">
                <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No pack configurations yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {packConfigs.map((pack) => (
                  <div
                    key={pack.id}
                    className="flex items-center justify-between p-3 border rounded-md hover:bg-accent/50"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm">{pack.display_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {pack.conversion_factor.toFixed(2)} {item.base_uom} per {pack.pack_type}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deletePackConfig(pack.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Par Levels Tab */}
          <TabsContent value="pars" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Set minimum inventory levels per venue
              </p>
              <Button size="sm" variant="outline" disabled>
                <Plus className="w-4 h-4 mr-1" />
                Add Par
              </Button>
            </div>

            {pars.length === 0 ? (
              <div className="p-8 text-center border border-dashed rounded-md">
                <Settings className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No par levels configured</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pars.map((par) => (
                  <div
                    key={par.id}
                    className="p-3 border rounded-md hover:bg-accent/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{par.venue_name}</div>
                      <div className="flex gap-1">
                        {editingPar === par.id ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingPar(null)}
                          >
                            Cancel
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingPar(par.id)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deletePar(par.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {editingPar === par.id ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Par Level</Label>
                          <Input
                            type="number"
                            step="0.01"
                            defaultValue={par.par_level}
                            onBlur={(e) =>
                              updatePar(par.id, { par_level: parseFloat(e.target.value) })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Reorder Point</Label>
                          <Input
                            type="number"
                            step="0.01"
                            defaultValue={par.reorder_point}
                            onBlur={(e) =>
                              updatePar(par.id, { reorder_point: parseFloat(e.target.value) })
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground">Par Level:</span>{' '}
                          <span className="font-mono">{par.par_level}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Reorder:</span>{' '}
                          <span className="font-mono">{par.reorder_point}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
