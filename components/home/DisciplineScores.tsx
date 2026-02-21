/**
 * Discipline Scores — Enforcement Dashboard Widget
 *
 * Shows lowest-scoring venues and managers (operator-only).
 * Color-coded: green (70+), yellow (40-69), red (<40).
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, Building2, User } from 'lucide-react';

interface ScoreEntry {
  entity_id: string;
  entity_name: string | null;
  score: number;
  components: Record<string, any>;
  business_date: string;
}

interface DisciplineScoresProps {
  venueScores: ScoreEntry[];
  managerScores: ScoreEntry[];
}

export function DisciplineScores({ venueScores, managerScores }: DisciplineScoresProps) {
  // Show bottom 3 for each
  const lowestVenues = venueScores.slice(0, 3);
  const lowestManagers = managerScores.slice(0, 3);

  if (lowestVenues.length === 0 && lowestManagers.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <ShieldAlert className="h-5 w-5 text-brass" />
        <div>
          <h2 className="text-lg font-semibold">Discipline Scores</h2>
          <p className="text-xs text-muted-foreground">
            30-day composite enforcement scores — lowest first
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Venue Discipline */}
        {lowestVenues.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 font-medium">
                <Building2 className="w-4 h-4 text-opsos-sage-600" />
                Unit Discipline — Lowest Venues
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {lowestVenues.map((v) => (
                  <ScoreRow
                    key={v.entity_id}
                    name={v.entity_name || 'Unknown'}
                    score={v.score}
                    date={v.business_date}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Manager Reliability */}
        {lowestManagers.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 font-medium">
                <User className="w-4 h-4 text-opsos-sage-600" />
                Manager Reliability — Lowest Scores
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {lowestManagers.map((m) => (
                  <ScoreRow
                    key={m.entity_id}
                    name={m.entity_name || 'Unknown'}
                    score={m.score}
                    date={m.business_date}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ScoreRow({ name, score, date }: { name: string; score: number; date: string }) {
  const color =
    score >= 70 ? 'text-emerald-700 bg-emerald-100' :
    score >= 40 ? 'text-amber-700 bg-amber-100' :
    'text-red-700 bg-red-100';

  const barColor =
    score >= 70 ? 'bg-emerald-500' :
    score >= 40 ? 'bg-amber-500' :
    'bg-red-500';

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={`inline-flex items-center justify-center w-10 text-xs font-bold rounded px-1.5 py-0.5 ${color}`}>
        {score}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{name}</div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
          <div
            className={`h-1.5 rounded-full ${barColor}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}
