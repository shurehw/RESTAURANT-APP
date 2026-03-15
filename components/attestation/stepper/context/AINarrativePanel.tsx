'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface Props {
  /** The AI-generated narrative text for this module */
  narrative: string | undefined | null;
  /** Whether the narratives are currently being fetched */
  loading: boolean;
  /** Module label shown in the header, e.g. "Revenue Analysis" */
  label: string;
  /** Error message if the fetch failed */
  error?: string | null;
}

/**
 * Collapsible AI narrative briefing card shown within attestation steps.
 * Provides contextual AI analysis to help the manager during attestation.
 */
export function AINarrativePanel({ narrative, loading, label, error }: Props) {
  const [expanded, setExpanded] = useState(true);

  // Don't render anything if there's no narrative, it's not loading, and there's no error
  if (!narrative && !loading && !error) return null;

  return (
    <Card className="border-brass/20 bg-brass/[0.03]">
      <CardContent className="p-0">
        <button
          type="button"
          className="w-full flex items-center gap-2 px-4 py-3 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 text-brass animate-spin shrink-0" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-brass shrink-0" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-brass flex-1">
            AI {label}
          </span>
          {!loading && (expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ))}
        </button>

        {expanded && (
          <div className="px-4 pb-3">
            {loading ? (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <span>Generating analysis...</span>
              </div>
            ) : error ? (
              <div className="text-xs text-error bg-error/5 border border-error/20 rounded-md px-3 py-2">
                {error}
              </div>
            ) : narrative ? (
              <p className="text-sm leading-relaxed text-foreground/85">
                {narrative}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
