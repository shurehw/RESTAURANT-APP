"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

interface PDR {
  id: string;
  room_name: string;
  capacity: number;
  events_per_month: number;
  avg_spend_per_person: number;
  avg_party_size: number;
  ramp_months: number;
  food_pct: number;
  bev_pct: number;
  other_pct: number;
}

interface PDRManagerProps {
  scenarioId: string;
}

export function PDRManager({ scenarioId }: PDRManagerProps) {
  const [pdrs, setPdrs] = useState<PDR[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPDR, setNewPDR] = useState({
    room_name: "",
    capacity: 20,
    events_per_month: 8,
    avg_spend_per_person: 150,
    avg_party_size: 15,
    ramp_months: 12,
    food_pct: 60,
    bev_pct: 35,
    other_pct: 5,
  });

  useEffect(() => {
    loadPDRs();
  }, [scenarioId]);

  const loadPDRs = async () => {
    try {
      const response = await fetch(`/api/proforma/pdr?scenario_id=${scenarioId}`);
      if (response.ok) {
        const data = await response.json();
        setPdrs(data.pdrs || []);
      }
    } catch (error) {
      console.error("Error loading PDRs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPDR = async () => {
    if (!newPDR.room_name) {
      alert("Please enter a room name");
      return;
    }

    if (newPDR.avg_party_size > newPDR.capacity) {
      alert("Average party size cannot exceed room capacity");
      return;
    }

    const mixSum = newPDR.food_pct + newPDR.bev_pct + newPDR.other_pct;
    if (Math.abs(mixSum - 100) > 0.1) {
      alert("Food + Bev + Other must sum to 100%");
      return;
    }

    try {
      const response = await fetch("/api/proforma/pdr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          room_name: newPDR.room_name,
          capacity: newPDR.capacity,
          events_per_month: newPDR.events_per_month,
          avg_spend_per_person: newPDR.avg_spend_per_person,
          avg_party_size: newPDR.avg_party_size,
          ramp_months: newPDR.ramp_months,
          // Convert to 0-1 decimals
          food_pct: newPDR.food_pct / 100,
          bev_pct: newPDR.bev_pct / 100,
          other_pct: newPDR.other_pct / 100,
        }),
      });

      if (!response.ok) throw new Error("Failed to add PDR");

      setNewPDR({
        room_name: "",
        capacity: 20,
        events_per_month: 8,
        avg_spend_per_person: 150,
        avg_party_size: 15,
        ramp_months: 12,
        food_pct: 60,
        bev_pct: 35,
        other_pct: 5,
      });
      loadPDRs();
    } catch (error) {
      console.error("Error adding PDR:", error);
      alert("Failed to add private dining room");
    }
  };

  const handleDeletePDR = async (id: string) => {
    if (!confirm("Delete this private dining room?")) return;

    try {
      const response = await fetch(`/api/proforma/pdr?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");
      loadPDRs();
    } catch (error) {
      console.error("Error deleting PDR:", error);
      alert("Failed to delete private dining room");
    }
  };

  const calculateMonthlyRevenue = (pdr: PDR) => {
    return pdr.events_per_month * pdr.avg_party_size * pdr.avg_spend_per_person;
  };

  if (loading) {
    return <div className="text-zinc-400">Loading private dining rooms...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-50 mb-2">
          Private Dining Rooms
        </h3>
        <p className="text-sm text-zinc-400">
          Track buyout and private event revenue. These are calculated separately from main dining room covers.
        </p>
      </div>

      {/* Existing PDRs */}
      {pdrs.length > 0 && (
        <div className="space-y-3">
          {pdrs.map((pdr) => (
            <Card key={pdr.id} className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 grid grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Room Name</Label>
                    <div className="text-sm font-medium text-zinc-50 mt-1">
                      {pdr.room_name}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Cap: {pdr.capacity} guests
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Events/Month</Label>
                    <div className="text-sm text-zinc-300 mt-1">
                      {pdr.events_per_month}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Avg party: {pdr.avg_party_size}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Avg Spend/Person</Label>
                    <div className="text-sm text-zinc-300 mt-1">
                      ${pdr.avg_spend_per_person.toFixed(2)}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Ramp: {pdr.ramp_months}mo
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Mix</Label>
                    <div className="text-xs text-zinc-400 mt-1">
                      F: {(pdr.food_pct * 100).toFixed(0)}% / B: {(pdr.bev_pct * 100).toFixed(0)}% / O: {(pdr.other_pct * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <Label className="text-xs">Est. Monthly</Label>
                  <div className="text-sm font-semibold text-[#D4AF37] mt-1">
                    ${calculateMonthlyRevenue(pdr).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeletePDR(pdr.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add New PDR */}
      <Card className="p-4 border-dashed">
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-zinc-300">Add Private Dining Room</h4>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="room_name">Room Name *</Label>
              <Input
                id="room_name"
                placeholder="Chef's Table, Wine Room"
                value={newPDR.room_name}
                onChange={(e) => setNewPDR({ ...newPDR, room_name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="capacity">Capacity *</Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                value={newPDR.capacity}
                onChange={(e) => setNewPDR({ ...newPDR, capacity: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label htmlFor="avg_party_size">Avg Party Size *</Label>
              <Input
                id="avg_party_size"
                type="number"
                step="0.1"
                min="1"
                value={newPDR.avg_party_size}
                onChange={(e) => setNewPDR({ ...newPDR, avg_party_size: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="events_per_month">Events/Month *</Label>
              <Input
                id="events_per_month"
                type="number"
                step="0.1"
                min="0"
                value={newPDR.events_per_month}
                onChange={(e) => setNewPDR({ ...newPDR, events_per_month: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label htmlFor="avg_spend">Avg Spend/Person *</Label>
              <Input
                id="avg_spend"
                type="number"
                step="0.01"
                min="0"
                value={newPDR.avg_spend_per_person}
                onChange={(e) => setNewPDR({ ...newPDR, avg_spend_per_person: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label htmlFor="ramp_months">Ramp Months *</Label>
              <Input
                id="ramp_months"
                type="number"
                min="1"
                value={newPDR.ramp_months}
                onChange={(e) => setNewPDR({ ...newPDR, ramp_months: parseInt(e.target.value) || 12 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="food_pct">Food % *</Label>
              <Input
                id="food_pct"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={newPDR.food_pct}
                onChange={(e) => setNewPDR({ ...newPDR, food_pct: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label htmlFor="bev_pct">Bev % *</Label>
              <Input
                id="bev_pct"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={newPDR.bev_pct}
                onChange={(e) => setNewPDR({ ...newPDR, bev_pct: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label htmlFor="other_pct">Other % *</Label>
              <Input
                id="other_pct"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={newPDR.other_pct}
                onChange={(e) => setNewPDR({ ...newPDR, other_pct: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <Button onClick={handleAddPDR} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Private Dining Room
          </Button>
        </div>
      </Card>

      {pdrs.length === 0 && (
        <div className="text-center py-8 text-zinc-500 text-sm">
          No private dining rooms configured. This is optional—add if your concept includes private event spaces.
        </div>
      )}
    </div>
  );
}
