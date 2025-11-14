"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";

interface AIMatchButtonProps {
  statementLineId: string;
}

export function AIMatchButton({ statementLineId }: AIMatchButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleAIMatch = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/vendor-statements/ai-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement_line_id: statementLineId }),
      });

      const result = await response.json();

      if (result.success && result.matched) {
        alert(
          `AI Match Found!\n\n` +
            `PO: ${result.po_number}\n` +
            `Confidence: ${(result.confidence * 100).toFixed(1)}%\n` +
            `Reasoning: ${result.reasoning}\n\n` +
            `${result.requires_review ? "⚠️ Flagged for manual review" : "✅ Auto-approved"}`
        );
        window.location.reload();
      } else {
        alert(
          `No Match Found\n\n` +
            `Reasoning: ${result.reasoning || "Could not find a suitable match"}\n\n` +
            `Manual matching required.`
        );
      }
    } catch (error) {
      alert("Error during AI matching");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleAIMatch}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4" />
      )}
      AI Match
    </Button>
  );
}
