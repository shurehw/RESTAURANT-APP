"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Building2 } from "lucide-react";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { ProjectCard } from "./ProjectCard";

interface ProformaClientProps {
  projects: any[];
  organizationId: string;
}

export function ProformaClient({ projects, organizationId }: ProformaClientProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <div className="flex-1 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Proforma Builder</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Model new concepts with simple assumptions → get full P&L projections
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-zinc-800 rounded-lg bg-zinc-900/50">
          <Building2 className="w-12 h-12 text-zinc-600 mb-4" />
          <h3 className="text-lg font-semibold text-zinc-300 mb-2">No projects yet</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Create your first proforma project to get started
          </p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        organizationId={organizationId}
      />
    </div>
  );
}
