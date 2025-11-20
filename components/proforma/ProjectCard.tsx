"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Calendar, TrendingUp } from "lucide-react";
import Link from "next/link";

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
  const scenariosCount = project.proforma_scenarios?.length || 0;
  const baseScenario = project.proforma_scenarios?.find((s: any) => s.is_base);

  return (
    <Link href={`/proforma/${project.id}`}>
      <Card className="p-4 hover:bg-zinc-800/50 transition-colors cursor-pointer border-zinc-800">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#F4A949]" />
            <h3 className="font-semibold text-zinc-50">{project.name}</h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {CONCEPT_LABELS[project.concept_type] || project.concept_type}
          </Badge>
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
      </Card>
    </Link>
  );
}
