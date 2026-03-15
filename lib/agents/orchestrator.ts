/**
 * Agent Orchestrator
 *
 * Runs all registered nightly agents for a venue and saves results
 * to the Action Center (manager_actions table). Handles:
 * - Data dependency checks (skip agents missing required data)
 * - Deduplication (same title + venue + date + source_type)
 * - Expiry calculation
 * - Error isolation (one agent failure doesn't block others)
 *
 * Usage:
 *   await runNightlyAgents(context)
 */

import { getServiceClient } from '@/lib/supabase/service';
import {
  getNightlyAgents,
  canRun,
  type AgentContext,
  type AgentResult,
  type ActionResult,
} from './registry';

// ── Side-effect imports: register all agents ─────────────────────
import './comp-review-agent';
import './drill-insights-agent';
import './procurement-anomaly-agent';

// ── Types ────────────────────────────────────────────────────────

export interface OrchestratorResult {
  venue: string;
  agentResults: Array<{
    agentId: string;
    actionsCreated: number;
    skipped: number;
    errors: string[];
    summary?: string;
  }>;
  totalActions: number;
}

// ── Orchestrator ─────────────────────────────────────────────────

/**
 * Run all nightly agents for a single venue.
 */
export async function runNightlyAgents(ctx: AgentContext): Promise<OrchestratorResult> {
  const agents = getNightlyAgents();
  const results: OrchestratorResult['agentResults'] = [];
  let totalActions = 0;

  for (const agent of agents) {
    if (!canRun(agent, ctx)) {
      results.push({
        agentId: agent.id,
        actionsCreated: 0,
        skipped: 0,
        errors: [],
        summary: 'skipped (missing data)',
      });
      continue;
    }

    try {
      const agentResult = await agent.run(ctx);
      const saved = await saveActions(ctx, agentResult);
      totalActions += saved.created;

      results.push({
        agentId: agent.id,
        actionsCreated: saved.created,
        skipped: saved.skipped,
        errors: saved.errors,
        summary: agentResult.summary,
      });
    } catch (err: any) {
      console.error(`[orchestrator] Agent ${agent.id} failed for ${ctx.venueName}:`, err.message);
      results.push({
        agentId: agent.id,
        actionsCreated: 0,
        skipped: 0,
        errors: [err.message],
      });
    }
  }

  return { venue: ctx.venueName, agentResults: results, totalActions };
}

/**
 * Run all nightly agents for multiple venues in parallel.
 */
export async function runNightlyAgentsForVenues(
  contexts: AgentContext[]
): Promise<OrchestratorResult[]> {
  const results = await Promise.allSettled(
    contexts.map((ctx) => runNightlyAgents(ctx))
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`[orchestrator] Venue ${contexts[i].venueName} failed:`, r.reason?.message);
    return {
      venue: contexts[i].venueName,
      agentResults: [],
      totalActions: 0,
    };
  });
}

// ── Action Persistence ───────────────────────────────────────────

/**
 * Extract assigned_to from action text (Manager X, Server Y patterns)
 */
function extractAssignedTo(actionText: string): string | undefined {
  const managerMatch = actionText.match(/Manager\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (managerMatch) return managerMatch[1];
  const serverMatch = actionText.match(/Server\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (serverMatch) return serverMatch[1];
  return undefined;
}

/**
 * Extract all employee names from description text
 */
function extractEmployeeNames(text: string): string[] {
  const names: string[] = [];
  const matches = text.matchAll(/(Server|Manager)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g);
  for (const match of matches) names.push(match[2]);
  return [...new Set(names)];
}

async function saveActions(
  ctx: AgentContext,
  result: AgentResult
): Promise<{ created: number; skipped: number; errors: string[] }> {
  if (result.actions.length === 0) {
    return { created: 0, skipped: 0, errors: [] };
  }

  const supabase = getServiceClient();
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const action of result.actions) {
    try {
      // Dedup: same venue + date + title + source_type → skip
      const { data: existing } = await (supabase as any)
        .from('manager_actions')
        .select('id')
        .eq('venue_id', ctx.venueId)
        .eq('business_date', ctx.businessDate)
        .eq('title', action.title)
        .eq('source_type', action.source_type)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const expiresAt = action.expires_in_days != null
        ? new Date(Date.now() + action.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const row = {
        venue_id: ctx.venueId,
        business_date: ctx.businessDate,
        source_report: `nightly_${ctx.businessDate}`,
        source_type: action.source_type,
        priority: action.priority,
        category: action.category,
        title: action.title,
        description: action.description,
        action: action.action,
        assigned_to: action.assigned_to || extractAssignedTo(action.action),
        assigned_role: action.assigned_role,
        related_checks: action.related_checks || [],
        related_employees: action.related_employees || extractEmployeeNames(action.description),
        metadata: {
          ...(action.metadata || {}),
          venue_name: ctx.venueName,
          ai_generated: true,
          agent_id: result.agentId,
        },
        status: 'pending',
        expires_at: expiresAt,
      };

      const { error } = await (supabase as any)
        .from('manager_actions')
        .insert(row);

      if (error) {
        // Skip duplicate key constraint violations silently
        if (error.code === '23505') { skipped++; continue; }
        errors.push(`${action.title}: ${error.message}`);
      } else {
        created++;
      }
    } catch (err: any) {
      errors.push(`${action.title}: ${err.message}`);
    }
  }

  return { created, skipped, errors };
}
