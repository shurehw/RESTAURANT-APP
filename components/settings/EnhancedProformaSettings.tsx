"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Save, History, Shield, GitCompare } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { VersionHistory } from "./VersionHistory";
import { SourceBadge } from "./SourceBadge";
import { TimeTravelPicker } from "./TimeTravelPicker";
import { SettingsDiff } from "./SettingsDiff";
import { AuditLog } from "./AuditLog";
import { ApprovalWorkflow } from "./ApprovalWorkflow";
import { ProformaSettingsClient } from "./ProformaSettingsClient";

interface EnhancedProformaSettingsProps {
  settings: any;
  orgId: string;
  isGlobalSettings?: boolean;
  requireApproval?: boolean;
}

export function EnhancedProformaSettings({
  settings,
  orgId,
  isGlobalSettings = false,
  requireApproval = false,
}: EnhancedProformaSettingsProps) {
  const [timeTravelSettings, setTimeTravelSettings] = useState<any>(null);
  const [timeTravelDate, setTimeTravelDate] = useState<Date | null>(null);
  const [compareVersion, setCompareVersion] = useState<any>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const handleTimeTravelSelect = (date: Date | null, historicalSettings: any) => {
    setTimeTravelDate(date);
    setTimeTravelSettings(historicalSettings);
  };

  const handleVersionSelect = (version: any) => {
    setCompareVersion(version);
  };

  const currentSettings = timeTravelSettings || settings;
  const isViewingHistory = timeTravelDate !== null;

  return (
    <div className="space-y-6">
      {/* Header with Source Badge and Time Travel */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">FP&A Settings</h2>
            <SourceBadge isGlobal={isGlobalSettings} />
          </div>

          <div className="flex items-center gap-2">
            <TimeTravelPicker
              orgId={orgId}
              onDateSelect={handleTimeTravelSelect}
            />
          </div>
        </div>

        {isViewingHistory && (
          <Alert className="mt-4">
            <History className="h-4 w-4" />
            <AlertTitle>Viewing Historical Settings</AlertTitle>
            <AlertDescription>
              You are viewing settings as they were on{" "}
              {timeTravelDate?.toLocaleDateString()}. Changes are disabled in this mode.
            </AlertDescription>
          </Alert>
        )}

        {isGlobalSettings && !isViewingHistory && (
          <Alert className="mt-4">
            <Shield className="h-4 w-4" />
            <AlertTitle>Global Default Settings</AlertTitle>
            <AlertDescription>
              These are system-wide defaults. To customize for your organization,
              create an organization-specific override instead of modifying these values.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error: {error.code}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
      </Card>

      {/* Main Content with Tabs */}
      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="settings">
            <Save className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            Version History
          </TabsTrigger>
          <TabsTrigger value="compare">
            <GitCompare className="h-4 w-4 mr-2" />
            Compare
          </TabsTrigger>
          <TabsTrigger value="audit">
            <Shield className="h-4 w-4 mr-2" />
            Audit Log
          </TabsTrigger>
          {requireApproval && (
            <TabsTrigger value="approvals">
              <AlertCircle className="h-4 w-4 mr-2" />
              Approvals
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="settings" className="mt-6">
          <ProformaSettingsClient
            settings={currentSettings}
            orgId={orgId}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <VersionHistory
            orgId={orgId}
            onSelectVersion={handleVersionSelect}
          />
        </TabsContent>

        <TabsContent value="compare" className="mt-6">
          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="text-sm font-medium mb-3">Select Versions to Compare</h3>
              <p className="text-sm text-gray-500">
                Click on versions in the Version History tab to select them for comparison.
                The diff will show changes between the selected version and the current version.
              </p>
            </Card>

            {compareVersion ? (
              <SettingsDiff
                oldVersion={compareVersion}
                newVersion={settings}
              />
            ) : (
              <Card className="p-4">
                <p className="text-sm text-gray-500">
                  No version selected. Go to Version History tab and click on a version to compare.
                </p>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-6">
          <AuditLog
            tableName="proforma_settings"
            recordId={orgId}
            limit={100}
          />
        </TabsContent>

        {requireApproval && (
          <TabsContent value="approvals" className="mt-6">
            <ApprovalWorkflow
              organizationId={orgId}
              onApproved={() => {
                // Refresh settings after approval
                window.location.reload();
              }}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
