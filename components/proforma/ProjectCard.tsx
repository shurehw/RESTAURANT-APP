"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Calendar, TrendingUp, Archive, Trash2, MoreVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProjectCardProps {
  project: any;
}

const CONCEPT_LABELS: Record<string, string> = {
  fsr: "Full Service Restaurant",
  nightlife: "Nightlife / Club",
  fast_casual: "Fast Casual",
  coffee: "Coffee Shop",
  bakery: "Bakery",
};

export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const scenariosCount = project.proforma_scenarios?.length || 0;
  const baseScenario = project.proforma_scenarios?.find((s: any) => s.is_base);

  const handleArchive = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Archive "${project.name}"? You can restore it later.`)) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/proforma/projects/${project.id}/archive`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to archive project");

      router.refresh();
    } catch (error) {
      console.error("Error archiving project:", error);
      alert("Failed to archive project");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Permanently delete "${project.name}"? This cannot be undone.`)) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/proforma/projects/${project.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete project");

      router.refresh();
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("Failed to delete project");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-4 hover:bg-zinc-800/50 transition-colors border-zinc-800 relative group">
      <Link href={`/proforma/${project.id}`} className="block">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#F4A949]" />
            <h3 className="font-semibold text-zinc-50">{project.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {CONCEPT_LABELS[project.concept_type] || project.concept_type}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  disabled={isLoading}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleArchive}>
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="text-red-400">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {project.location_city && (
          <p className="text-sm text-zinc-400 mb-3">
            {project.location_city}
            {project.location_state && `, ${project.location_state}`}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
          {project.seats && (
            <div className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              <span>{project.seats} seats</span>
            </div>
          )}
          {scenariosCount > 0 && (
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>{scenariosCount} scenario{scenariosCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {baseScenario && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <Calendar className="w-3 h-3" />
              <span>
                {baseScenario.months} months starting{" "}
                {new Date(baseScenario.start_month).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        )}
      </Link>
    </Card>
  );
}
