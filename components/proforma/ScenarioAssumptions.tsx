"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { RevenueAssumptions } from "./assumptions/RevenueAssumptions";
import { CogsAssumptions } from "./assumptions/CogsAssumptions";
import { LaborAssumptions } from "./assumptions/LaborAssumptions";
import { OpexAssumptions } from "./assumptions/OpexAssumptions";
import { CapexAssumptions } from "./assumptions/CapexAssumptions";
import { PreopeningAssumptions } from "./assumptions/PreopeningAssumptions";
import { ScenarioResults } from "./ScenarioResults";
import { SanityCheckPanel } from "./SanityCheckPanel";

interface ScenarioAssumptionsProps {
  scenario: any;
  project: any;
}

export function ScenarioAssumptions({
  scenario,
  project,
}: ScenarioAssumptionsProps) {
  const [activeTab, setActiveTab] = useState("revenue");

  return (
    <div className="h-full flex gap-6">
      {/* Main Tabs Area */}
      <div className="flex-1">
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

      {/* Sanity Check Sidebar */}
      <div className="w-96">
        <SanityCheckPanel scenarioId={scenario.id} projectId={project.id} />
      </div>
    </div>
  );
}
