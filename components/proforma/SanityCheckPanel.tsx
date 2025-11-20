"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, XCircle, Sparkles, Loader2 } from "lucide-react";

interface SanityCheckPanelProps {
  scenarioId: string;
  projectId: string;
}

export function SanityCheckPanel({ scenarioId, projectId }: SanityCheckPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCheck = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/proforma/sanity-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          project_id: projectId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to run sanity check");
      }

      const data = await response.json();
      setResult(data.sanityCheck);
    } catch (error) {
      console.error("Error running sanity check:", error);
      alert("Failed to run sanity check");
    } finally {
      setLoading(false);
    }
  };

  const getAssessmentIcon = (assessment: string) => {
    switch (assessment) {
      case "GOOD":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "CAUTION":
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case "RED_FLAG":
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-zinc-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-400 border-red-500/30 bg-red-500/10";
      case "warning":
        return "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";
      case "info":
        return "text-blue-400 border-blue-500/30 bg-blue-500/10";
      default:
        return "text-zinc-400 border-zinc-500/30 bg-zinc-500/10";
    }
  };

  return (
    <Card className="p-6 border-ledger-gold/20 bg-zinc-900/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-ledger-gold" />
          <h3 className="text-lg font-semibold text-zinc-50">AI Sanity Check</h3>
        </div>
        <Button onClick={handleCheck} disabled={loading} size="sm" variant="outline">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Run Check
            </>
          )}
        </Button>
      </div>

      {!result && (
        <p className="text-sm text-zinc-400">
          Get AI-powered insights on your assumptions compared to industry benchmarks
        </p>
      )}

      {result && (
        <div className="space-y-4">
          {/* Assessment */}
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
            {getAssessmentIcon(result.assessment)}
            <span className="font-semibold text-zinc-50">
              {result.assessment === "GOOD" && "Assumptions Look Good"}
              {result.assessment === "CAUTION" && "Review Recommended"}
              {result.assessment === "RED_FLAG" && "Critical Issues Found"}
            </span>
          </div>

          {/* Summary */}
          {result.summary && (
            <div className="text-sm text-zinc-300 bg-zinc-800/50 p-3 rounded">
              {result.summary}
            </div>
          )}

          {/* Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-zinc-300">Warnings</h4>
              {result.warnings.map((warning: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-3 rounded border text-sm ${getSeverityColor(
                    warning.severity
                  )}`}
                >
                  <div className="font-medium mb-1">{warning.metric}</div>
                  <div className="text-xs opacity-90 mb-1">
                    Your value: {warning.value} | Benchmark: {warning.benchmark}
                  </div>
                  <div className="text-xs opacity-80">{warning.message}</div>
                </div>
              ))}
            </div>
          )}

          {/* Insights */}
          {result.insights && result.insights.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-zinc-300">Insights</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                {result.insights.map((insight: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-ledger-gold mt-1">•</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
