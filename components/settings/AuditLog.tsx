"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Calendar, FileEdit } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  field_name: string;
  old_value: any;
  new_value: any;
  user_id: string | null;
  user_email: string | null;
  changed_at: string;
}

interface AuditLogProps {
  tableName?: string;
  recordId?: string;
  limit?: number;
}

export function AuditLog({
  tableName = "proforma_settings",
  recordId,
  limit = 50,
}: AuditLogProps) {
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLog();
  }, [tableName, recordId, limit]);

  const fetchAuditLog = async () => {
    try {
      let url = `/api/proforma/audit-log?table_name=${tableName}&limit=${limit}`;
      if (recordId) {
        url += `&record_id=${recordId}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      setAuditLog(data.audit_log || []);
    } catch (error) {
      console.error("Error fetching audit log:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatFieldName = (field: string): string => {
    return field
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return value.toLocaleString();
    return String(value);
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
      <h3 className="text-sm font-medium flex items-center gap-2 mb-4">
        <FileEdit className="h-4 w-4" />
        Change History ({auditLog.length})
      </h3>

      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {auditLog.length === 0 ? (
          <p className="text-sm text-gray-500">No changes recorded</p>
        ) : (
          auditLog.map((entry) => (
            <div
              key={entry.id}
              className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <Badge variant="outline" className="mb-1">
                    {formatFieldName(entry.field_name)}
                  </Badge>
                  <div className="text-sm">
                    <span className="text-gray-500 line-through">
                      {formatValue(entry.old_value)}
                    </span>
                    {" → "}
                    <span className="font-medium">
                      {formatValue(entry.new_value)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-500">
                {entry.user_email && (
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span className="truncate max-w-[150px]">{entry.user_email}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {formatDistanceToNow(new Date(entry.changed_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
