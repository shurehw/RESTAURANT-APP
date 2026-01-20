"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Plus, Minus, Edit } from "lucide-react";

interface SettingsDiffProps {
  oldVersion: any;
  newVersion: any;
}

type ChangeType = "added" | "removed" | "modified" | "unchanged";

interface Change {
  field: string;
  oldValue: any;
  newValue: any;
  type: ChangeType;
}

export function SettingsDiff({ oldVersion, newVersion }: SettingsDiffProps) {
  if (!oldVersion || !newVersion) {
    return (
      <Card className="p-4">
        <p className="text-sm text-gray-500">
          Select two versions to compare
        </p>
      </Card>
    );
  }

  const getChanges = (): Change[] => {
    const changes: Change[] = [];
    const allKeys = new Set([
      ...Object.keys(oldVersion),
      ...Object.keys(newVersion),
    ]);

    // Exclude metadata fields from diff
    const excludeFields = [
      "org_id",
      "version",
      "effective_from",
      "effective_to",
      "is_active",
      "created_by",
      "superseded_by_org_id",
      "superseded_by_version",
      "created_at",
      "updated_at",
    ];

    allKeys.forEach((key) => {
      if (excludeFields.includes(key)) return;

      const oldVal = oldVersion[key];
      const newVal = newVersion[key];

      if (oldVal === undefined && newVal !== undefined) {
        changes.push({ field: key, oldValue: null, newValue: newVal, type: "added" });
      } else if (oldVal !== undefined && newVal === undefined) {
        changes.push({ field: key, oldValue: oldVal, newValue: null, type: "removed" });
      } else if (oldVal !== newVal) {
        changes.push({ field: key, oldValue: oldVal, newValue: newVal, type: "modified" });
      }
    });

    return changes;
  };

  const changes = getChanges();
  const modifiedCount = changes.filter((c) => c.type === "modified").length;
  const addedCount = changes.filter((c) => c.type === "added").length;
  const removedCount = changes.filter((c) => c.type === "removed").length;

  const formatFieldName = (field: string): string => {
    return field
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return value.toLocaleString();
    return String(value);
  };

  return (
    <Card className="p-4">
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">
          Comparing Version {oldVersion.version} → Version {newVersion.version}
        </h3>
        <div className="flex gap-2">
          {modifiedCount > 0 && (
            <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-300">
              <Edit className="h-3 w-3 mr-1" />
              {modifiedCount} modified
            </Badge>
          )}
          {addedCount > 0 && (
            <Badge variant="outline" className="bg-green-50 text-green-800 border-green-300">
              <Plus className="h-3 w-3 mr-1" />
              {addedCount} added
            </Badge>
          )}
          {removedCount > 0 && (
            <Badge variant="outline" className="bg-red-50 text-red-800 border-red-300">
              <Minus className="h-3 w-3 mr-1" />
              {removedCount} removed
            </Badge>
          )}
          {changes.length === 0 && (
            <Badge variant="outline" className="text-gray-600">
              No changes
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {changes.length === 0 ? (
          <p className="text-sm text-gray-500">No changes between these versions</p>
        ) : (
          changes.map((change, idx) => (
            <div
              key={idx}
              className={`p-3 border rounded-lg ${
                change.type === "modified"
                  ? "border-yellow-300 bg-yellow-50"
                  : change.type === "added"
                  ? "border-green-300 bg-green-50"
                  : "border-red-300 bg-red-50"
              }`}
            >
              <div className="text-xs font-medium text-gray-700 mb-1">
                {formatFieldName(change.field)}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`${
                    change.type === "removed" ? "line-through text-red-600" : ""
                  }`}
                >
                  {formatValue(change.oldValue)}
                </span>
                {change.type === "modified" && (
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                )}
                {change.type !== "removed" && (
                  <span className="font-medium">{formatValue(change.newValue)}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
