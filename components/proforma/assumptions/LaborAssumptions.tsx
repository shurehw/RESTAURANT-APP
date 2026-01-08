"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Plus, Trash2 } from "lucide-react";

interface LaborAssumptionsProps {
  scenarioId: string;
  assumptions?: any;
}

export function LaborAssumptions({
  scenarioId,
  assumptions,
}: LaborAssumptionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salariedRoles, setSalariedRoles] = useState<any[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  const [formData, setFormData] = useState({
    foh_hours_per_100_covers: assumptions?.foh_hours_per_100_covers || 50,
    boh_hours_per_100_covers: assumptions?.boh_hours_per_100_covers || 35,
    foh_hourly_rate: assumptions?.foh_hourly_rate || 20,
    boh_hourly_rate: assumptions?.boh_hourly_rate || 22,
    gm_salary_annual: assumptions?.gm_salary_annual || 90000,
    agm_salary_annual: assumptions?.agm_salary_annual || 65000,
    km_salary_annual: assumptions?.km_salary_annual || 75000,
    // Display as 0-100, stored as 0-1
    payroll_burden_pct: assumptions?.payroll_burden_pct ? assumptions.payroll_burden_pct * 100 : 25,
  });

  const [newRole, setNewRole] = useState({
    role_name: "",
    annual_salary: "",
    start_month: "1",
    end_month: "",
  });

  // Load salaried roles
  useEffect(() => {
    loadSalariedRoles();
  }, [scenarioId]);

  const loadSalariedRoles = async () => {
    try {
      const response = await fetch(
        `/api/proforma/salaried-roles?scenario_id=${scenarioId}`
      );
      if (response.ok) {
        const data = await response.json();
        setSalariedRoles(data.roles || []);
      }
    } catch (error) {
      console.error("Error loading salaried roles:", error);
    } finally {
      setLoadingRoles(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/proforma/assumptions/labor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          foh_hours_per_100_covers: formData.foh_hours_per_100_covers,
          boh_hours_per_100_covers: formData.boh_hours_per_100_covers,
          foh_hourly_rate: formData.foh_hourly_rate,
          boh_hourly_rate: formData.boh_hourly_rate,
          gm_salary_annual: formData.gm_salary_annual,
          agm_salary_annual: formData.agm_salary_annual,
          km_salary_annual: formData.km_salary_annual,
          // Convert from display (0-100) to storage (0-1)
          payroll_burden_pct: formData.payroll_burden_pct / 100,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save assumptions");
      }

      router.refresh();
      alert("Labor assumptions saved successfully");
    } catch (error) {
      console.error("Error saving assumptions:", error);
      alert("Failed to save assumptions");
    } finally {
      setLoading(false);
    }
  };

  const handleAddRole = async () => {
    if (!newRole.role_name || !newRole.annual_salary) {
      alert("Please enter role name and salary");
      return;
    }

    try {
      const response = await fetch("/api/proforma/salaried-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          role_name: newRole.role_name,
          annual_salary: parseFloat(newRole.annual_salary),
          start_month: parseInt(newRole.start_month),
          end_month: newRole.end_month ? parseInt(newRole.end_month) : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add role");
      }

      setNewRole({
        role_name: "",
        annual_salary: "",
        start_month: "1",
        end_month: "",
      });

      loadSalariedRoles();
    } catch (error) {
      console.error("Error adding role:", error);
      alert("Failed to add role");
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm("Delete this role?")) return;

    try {
      const response = await fetch(
        `/api/proforma/salaried-roles?id=${roleId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to delete role");
      }

      loadSalariedRoles();
    } catch (error) {
      console.error("Error deleting role:", error);
      alert("Failed to delete role");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-50 mb-4">
          Labor Assumptions
        </h3>
        <p className="text-sm text-zinc-400">
          Productivity-based labor model (not % of sales)
        </p>
      </div>

      {/* Productivity */}
      <div>
        <h4 className="text-sm font-medium text-zinc-300 mb-3">Productivity</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="foh_hours_per_100_covers">
              FOH Hours per 100 Covers *
            </Label>
            <Input
              id="foh_hours_per_100_covers"
              type="number"
              step="0.01"
              value={formData.foh_hours_per_100_covers}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  foh_hours_per_100_covers: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="boh_hours_per_100_covers">
              BOH Hours per 100 Covers *
            </Label>
            <Input
              id="boh_hours_per_100_covers"
              type="number"
              step="0.01"
              value={formData.boh_hours_per_100_covers}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  boh_hours_per_100_covers: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
        </div>
      </div>

      {/* Hourly Rates */}
      <div>
        <h4 className="text-sm font-medium text-zinc-300 mb-3">Hourly Rates</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="foh_hourly_rate">FOH Hourly Rate *</Label>
            <Input
              id="foh_hourly_rate"
              type="number"
              step="0.01"
              value={formData.foh_hourly_rate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  foh_hourly_rate: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="boh_hourly_rate">BOH Hourly Rate *</Label>
            <Input
              id="boh_hourly_rate"
              type="number"
              step="0.01"
              value={formData.boh_hourly_rate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  boh_hourly_rate: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
        </div>
      </div>

      {/* Management Salaries (Legacy) */}
      <div>
        <h4 className="text-sm font-medium text-zinc-300 mb-3">
          Core Management Salaries (Annual)
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="gm_salary_annual">GM Salary *</Label>
            <Input
              id="gm_salary_annual"
              type="number"
              step="1000"
              value={formData.gm_salary_annual}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  gm_salary_annual: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="agm_salary_annual">AGM Salary *</Label>
            <Input
              id="agm_salary_annual"
              type="number"
              step="1000"
              value={formData.agm_salary_annual}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  agm_salary_annual: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="km_salary_annual">KM Salary *</Label>
            <Input
              id="km_salary_annual"
              type="number"
              step="1000"
              value={formData.km_salary_annual}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  km_salary_annual: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
        </div>
      </div>

      {/* Additional Salaried Roles */}
      <div className="border-t border-zinc-800 pt-4">
        <h4 className="text-sm font-medium text-zinc-300 mb-3">
          Additional Salaried Roles
        </h4>
        <p className="text-xs text-zinc-500 mb-4">
          Add security, sous chef, bar manager, etc. with custom start/end months
        </p>

        {/* Existing roles table */}
        {!loadingRoles && salariedRoles.length > 0 && (
          <div className="mb-4 border border-zinc-800 rounded">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/50">
                <tr>
                  <th className="text-left p-2 text-zinc-400">Role</th>
                  <th className="text-left p-2 text-zinc-400">Annual Salary</th>
                  <th className="text-left p-2 text-zinc-400">Start Month</th>
                  <th className="text-left p-2 text-zinc-400">End Month</th>
                  <th className="text-left p-2 text-zinc-400"></th>
                </tr>
              </thead>
              <tbody>
                {salariedRoles.map((role) => (
                  <tr key={role.id} className="border-t border-zinc-800">
                    <td className="p-2 text-zinc-300">{role.role_name}</td>
                    <td className="p-2 text-zinc-300">
                      ${role.annual_salary.toLocaleString()}
                    </td>
                    <td className="p-2 text-zinc-300">{role.start_month}</td>
                    <td className="p-2 text-zinc-300">
                      {role.end_month || "Always"}
                    </td>
                    <td className="p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRole(role.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add new role */}
        <div className="grid grid-cols-5 gap-2">
          <div>
            <Label htmlFor="new_role_name" className="text-xs">
              Role Name
            </Label>
            <Input
              id="new_role_name"
              value={newRole.role_name}
              onChange={(e) =>
                setNewRole({ ...newRole, role_name: e.target.value })
              }
              placeholder="Security Manager"
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="new_role_salary" className="text-xs">
              Annual Salary
            </Label>
            <Input
              id="new_role_salary"
              type="number"
              step="1000"
              value={newRole.annual_salary}
              onChange={(e) =>
                setNewRole({ ...newRole, annual_salary: e.target.value })
              }
              placeholder="60000"
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="new_role_start" className="text-xs">
              Start Month
            </Label>
            <Input
              id="new_role_start"
              type="number"
              min="1"
              value={newRole.start_month}
              onChange={(e) =>
                setNewRole({ ...newRole, start_month: e.target.value })
              }
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="new_role_end" className="text-xs">
              End Month
            </Label>
            <Input
              id="new_role_end"
              type="number"
              min="1"
              value={newRole.end_month}
              onChange={(e) =>
                setNewRole({ ...newRole, end_month: e.target.value })
              }
              placeholder="Optional"
              className="text-sm"
            />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={handleAddRole} size="sm" className="w-full">
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </div>

      {/* Payroll Burden */}
      <div>
        <Label htmlFor="payroll_burden_pct">Payroll Burden % *</Label>
        <Input
          id="payroll_burden_pct"
          type="number"
          step="0.01"
          value={formData.payroll_burden_pct}
          onChange={(e) =>
            setFormData({
              ...formData,
              payroll_burden_pct: parseFloat(e.target.value),
            })
          }
          required
        />
        <p className="text-xs text-zinc-500 mt-1">
          Taxes, benefits, etc. as % of gross wages
        </p>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={loading}>
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Saving..." : "Save Labor Assumptions"}
        </Button>
      </div>
    </form>
  );
}
