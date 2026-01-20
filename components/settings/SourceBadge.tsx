"use client";

import { Badge } from "@/components/ui/badge";
import { Globe, Building2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SourceBadgeProps {
  isGlobal: boolean;
  className?: string;
}

export function SourceBadge({ isGlobal, className = "" }: SourceBadgeProps) {
  if (isGlobal) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge
              variant="secondary"
              className={`bg-blue-100 text-blue-800 border-blue-300 ${className}`}
            >
              <Globe className="h-3 w-3 mr-1" />
              Global Default
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              System-wide default - Create an organization override to customize
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant="secondary"
            className={`bg-green-100 text-green-800 border-green-300 ${className}`}
          >
            <Building2 className="h-3 w-3 mr-1" />
            Organization Override
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            Custom setting for your organization
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
