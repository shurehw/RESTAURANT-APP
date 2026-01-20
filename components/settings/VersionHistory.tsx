"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, User, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Version {
  org_id: string;
  version: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_by: string | null;
  superseded_by_org_id: string | null;
  superseded_by_version: number | null;
  [key: string]: any;
}

interface VersionHistoryProps {
  orgId: string;
  onSelectVersion?: (version: Version) => void;
}

export function VersionHistory({ orgId, onSelectVersion }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetchVersionHistory();
  }, [orgId]);

  const fetchVersionHistory = async () => {
    try {
      const response = await fetch(`/api/proforma/settings-history?org_id=${orgId}`);
      const data = await response.json();
      setVersions(data.versions || []);
    } catch (error) {
      console.error("Error fetching version history:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Version History ({versions.length})
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {expanded && (
        <div className="space-y-2">
          {versions.length === 0 ? (
            <p className="text-sm text-gray-500">No version history available</p>
          ) : (
            versions.map((version) => (
              <div
                key={version.version}
                className={`p-3 border rounded-lg ${
                  version.is_active && version.effective_to === null
                    ? "border-green-500 bg-green-50"
                    : "border-gray-200"
                } hover:bg-gray-50 cursor-pointer transition-colors`}
                onClick={() => onSelectVersion?.(version)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        Version {version.version}
                      </span>
                      {version.is_active && version.effective_to === null && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-green-600 text-white rounded">
                          CURRENT
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(version.effective_from).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    {version.effective_to && (
                      <div className="text-xs text-gray-500">
                        Superseded {formatDistanceToNow(new Date(version.effective_to), { addSuffix: true })}
                      </div>
                    )}
                    {version.created_by && (
                      <div className="text-xs text-gray-400 flex items-center gap-1 justify-end mt-1">
                        <User className="h-3 w-3" />
                        <span className="truncate max-w-[100px]">{version.created_by}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
