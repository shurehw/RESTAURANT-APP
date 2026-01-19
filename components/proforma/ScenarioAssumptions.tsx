"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { RevenueAssumptions } from "./assumptions/RevenueAssumptions";
import { CogsAssumptions } from "./assumptions/CogsAssumptions";
import { LaborAssumptions } from "./assumptions/LaborAssumptions";
import { OpexAssumptions } from "./assumptions/OpexAssumptions";
import { CapexAssumptions } from "./assumptions/CapexAssumptions";
import { PreopeningAssumptions } from "./assumptions/PreopeningAssumptions";
import { ScenarioResults } from "./ScenarioResults";
import { CreateProjectDialog } from "./CreateProjectDialog";

interface ScenarioAssumptionsProps {
  scenario: any;
  project: any;
}

export function ScenarioAssumptions({
  scenario,
  project,
}: ScenarioAssumptionsProps) {
  const [activeTab, setActiveTab] = useState("revenue");
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-50">
          {project.name} - {scenario.scenario_name}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditDialogOpen(true)}
          className="gap-2"
        >
          <Pencil className="w-4 h-4" />
          Edit Project Details
        </Button>
      </div>

      <CreateProjectDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        organizationId={project.org_id}
        editMode={true}
        existingProject={project}
        existingScenario={scenario}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <TabsList className="mb-4">
          <TabsTrigger value="preopening">Preopening</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="cogs">COGS</TabsTrigger>
          <TabsTrigger value="labor">Labor</TabsTrigger>
          <TabsTrigger value="opex">OpEx</TabsTrigger>
          <TabsTrigger value="capex">CapEx</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="preopening" className="flex-1">
          <Card className="p-6">
            <PreopeningAssumptions
              scenarioId={scenario.id}
              assumptions={scenario.proforma_preopening_assumptions?.[0]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="flex-1">
          <Card className="p-6">
            <RevenueAssumptions
              scenarioId={scenario.id}
              assumptions={scenario.proforma_revenue_assumptions?.[0]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="cogs" className="flex-1">
          <Card className="p-6">
            <CogsAssumptions
              scenarioId={scenario.id}
              assumptions={scenario.proforma_cogs_assumptions?.[0]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="labor" className="flex-1">
          <Card className="p-6">
            <LaborAssumptions
              scenarioId={scenario.id}
              assumptions={scenario.proforma_labor_assumptions?.[0]}
              conceptType={project.concept_type}
            />
          </Card>
        </TabsContent>

        <TabsContent value="opex" className="flex-1">
          <Card className="p-6">
            <OpexAssumptions
              scenarioId={scenario.id}
              assumptions={scenario.proforma_occupancy_opex_assumptions?.[0]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="capex" className="flex-1">
          <Card className="p-6">
            <CapexAssumptions
              scenarioId={scenario.id}
              assumptions={scenario.proforma_capex_assumptions?.[0]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="results" className="flex-1">
          <ScenarioResults scenario={scenario} project={project} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
