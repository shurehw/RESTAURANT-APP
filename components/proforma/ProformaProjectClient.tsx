"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { ScenarioAssumptions } from "./ScenarioAssumptions";
import { ScenarioWizard } from "./ScenarioWizard";
import { CreateScenarioDialog } from "./CreateScenarioDialog";

interface ProformaProjectClientProps {
  project: any;
}

export function ProformaProjectClient({ project }: ProformaProjectClientProps) {
  const router = useRouter();
  const [showCreateScenario, setShowCreateScenario] = useState(false);

  const scenarios = project.proforma_scenarios || [];
  const baseScenario = scenarios.find((s: any) => s.is_base);
  const otherScenarios = scenarios.filter((s: any) => !s.is_base);

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/proforma">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-zinc-50">{project.name}</h1>
              <p className="text-sm text-zinc-400">
                {project.location_city && project.location_state
                  ? `${project.location_city}, ${project.location_state}`
                  : "Proforma Project"}
              </p>
            </div>
          </div>
          <Button onClick={() => setShowCreateScenario(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Scenario
          </Button>
        </div>
      </div>

      {/* Scenarios */}
      {scenarios.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">
              No scenarios yet
            </h3>
            <p className="text-sm text-zinc-500 mb-4">
              Create your first scenario to start modeling
            </p>
            <Button onClick={() => setShowCreateScenario(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Base Scenario
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-6">
          <Tabs defaultValue={baseScenario?.id || scenarios[0]?.id} className="h-full flex flex-col">
            <TabsList className="mb-4">
              {baseScenario && (
                <TabsTrigger value={baseScenario.id}>
                  {baseScenario.name} (Base)
                </TabsTrigger>
              )}
              {otherScenarios.map((scenario: any) => (
                <TabsTrigger key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {scenarios.map((scenario: any) => (
              <TabsContent key={scenario.id} value={scenario.id} className="flex-1">
                <ScenarioAssumptions scenario={scenario} project={project} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      {/* Create Scenario - Use Wizard for first scenario, Dialog for additional ones */}
      {!baseScenario ? (
        <ScenarioWizard
          open={showCreateScenario}
          onOpenChange={setShowCreateScenario}
          projectId={project.id}
        />
      ) : (
        <CreateScenarioDialog
          open={showCreateScenario}
          onOpenChange={setShowCreateScenario}
          projectId={project.id}
          hasBaseScenario={!!baseScenario}
          baseScenarioId={baseScenario?.id}
        />
      )}
    </div>
  );
}
