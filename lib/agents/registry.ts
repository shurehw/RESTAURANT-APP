/**
 * Agent Registry
 *
 * Central registry for all AI agents in the enforcement engine.
 * Each agent declares its capabilities, trigger, data dependencies,
 * and action output contract. The nightly orchestrator uses this
 * registry to run every agent that has data available.
 *
 * Agents follow a strict contract:
 *   run(context) → { actions: ActionResult[], meta }
 *
 * The orchestrator handles save/dedup — agents are pure analysis.
 */

// ── Types ────────────────────────────────────────────────────────

export interface AgentContext {
  venueId: string;
  venueName: string;
  orgId: string;
  businessDate: string;
  /** Nightly report data (if available) */
  report?: any;
  /** Labor data (if available) */
  labor?: any;
  /** TipSee location UUID for historical queries */
  tipseeUuid?: string;
}

export interface ActionResult {
  source_type: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  action: string;
  assigned_to?: string;
  assigned_role?: string;
  related_checks?: string[];
  related_employees?: string[];
  metadata?: Record<string, any>;
  /** Days until auto-expiry. null = never expires */
  expires_in_days?: number | null;
}

export interface AgentResult {
  agentId: string;
  actions: ActionResult[];
  /** Optional summary for logging */
  summary?: string;
}

export type AgentRunFn = (ctx: AgentContext) => Promise<AgentResult>;

export interface AgentDefinition {
  /** Unique agent identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this agent detects / does */
  description: string;
  /** source_type value written to manager_actions */
  sourceType: string;
  /** Which drill sections this agent's output maps to */
  drillSections: string[];
  /** Data the agent needs from the context */
  requires: ('report' | 'labor' | 'tipseeUuid')[];
  /** When this agent should run */
  trigger: 'nightly' | 'on-demand' | 'both';
  /** The agent's run function (lazy-loaded to avoid import bloat) */
  run: AgentRunFn;
}

// ── Registry ─────────────────────────────────────────────────────

const agents: AgentDefinition[] = [];

export function registerAgent(def: AgentDefinition): void {
  // Prevent duplicate registration
  if (agents.some((a) => a.id === def.id)) return;
  agents.push(def);
}

export function getAgent(id: string): AgentDefinition | undefined {
  return agents.find((a) => a.id === id);
}

export function getAgentsByTrigger(trigger: 'nightly' | 'on-demand' | 'both'): AgentDefinition[] {
  return agents.filter((a) => a.trigger === trigger || a.trigger === 'both');
}

export function getNightlyAgents(): AgentDefinition[] {
  return agents.filter((a) => a.trigger === 'nightly' || a.trigger === 'both');
}

export function getAllAgents(): AgentDefinition[] {
  return [...agents];
}

/**
 * Check if an agent has the data it needs to run
 */
export function canRun(def: AgentDefinition, ctx: AgentContext): boolean {
  for (const req of def.requires) {
    if (req === 'report' && !ctx.report) return false;
    if (req === 'labor' && !ctx.labor) return false;
    if (req === 'tipseeUuid' && !ctx.tipseeUuid) return false;
  }
  return true;
}
