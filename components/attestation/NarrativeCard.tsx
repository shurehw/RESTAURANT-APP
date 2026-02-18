'use client';

import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  narrative: string | null;
  loading: boolean;
  title: string;
}

export function NarrativeCard({ narrative, loading, title }: Props) {
  if (!loading && !narrative) return null;

  return (
    <Card className="bg-muted/20 border-brass/15">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-3.5 w-3.5 text-brass" />
          <span className="text-xs font-semibold uppercase tracking-wide text-brass">
            {title}
          </span>
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-5/6 rounded bg-muted" />
            <div className="h-3 w-4/6 rounded bg-muted" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {narrative}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
