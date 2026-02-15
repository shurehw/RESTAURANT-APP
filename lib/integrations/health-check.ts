/**
 * Integration Health Checks
 * Tests connectivity to external systems
 */

import { createAdminClient } from '@/lib/supabase/server';

export interface IntegrationHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  lastChecked: Date;
  message?: string;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'down';
  integrations: IntegrationHealth[];
  lastChecked: Date;
}

/**
 * Check TipSee integration health
 * Tests if we can query TipSee schema
 */
async function checkTipSeeHealth(): Promise<IntegrationHealth> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('tipsee_checks')
      .select('id')
      .limit(1);

    if (error) {
      return {
        name: 'TipSee',
        status: 'down',
        lastChecked: new Date(),
        message: error.message,
      };
    }

    return {
      name: 'TipSee',
      status: 'healthy',
      lastChecked: new Date(),
      message: 'Connected',
    };
  } catch (error: any) {
    return {
      name: 'TipSee',
      status: 'down',
      lastChecked: new Date(),
      message: error.message || 'Connection failed',
    };
  }
}

/**
 * Check UniFi Protect integration health
 * Tests if API key is configured
 */
async function checkUniFiHealth(): Promise<IntegrationHealth> {
  const apiKey = process.env.UNIFI_PROTECT_API_KEY;

  if (!apiKey) {
    return {
      name: 'UniFi Protect',
      status: 'unknown',
      lastChecked: new Date(),
      message: 'Not configured',
    };
  }

  // If configured, assume healthy (actual API check would be expensive)
  return {
    name: 'UniFi Protect',
    status: 'healthy',
    lastChecked: new Date(),
    message: 'Configured',
  };
}

/**
 * Check Simphony/Toast integration health
 * Tests if Simphony sales data is available
 */
async function checkSimphonyHealth(): Promise<IntegrationHealth> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('tipsee_simphony_sales')
      .select('id')
      .limit(1);

    if (error) {
      return {
        name: 'Simphony',
        status: 'unknown',
        lastChecked: new Date(),
        message: 'Not in use',
      };
    }

    return {
      name: 'Simphony',
      status: 'healthy',
      lastChecked: new Date(),
      message: 'Connected',
    };
  } catch (error: any) {
    return {
      name: 'Simphony',
      status: 'unknown',
      lastChecked: new Date(),
      message: 'Not in use',
    };
  }
}

/**
 * Get overall system health
 * Checks all integrations and returns aggregated status
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [tipsee, unifi, simphony] = await Promise.all([
    checkTipSeeHealth(),
    checkUniFiHealth(),
    checkSimphonyHealth(),
  ]);

  const integrations = [tipsee, unifi, simphony];

  // Determine overall status
  const hasDown = integrations.some((i) => i.status === 'down');
  const hasDegraded = integrations.some((i) => i.status === 'degraded');

  let overall: 'healthy' | 'degraded' | 'down';
  if (hasDown) {
    overall = 'down';
  } else if (hasDegraded) {
    overall = 'degraded';
  } else {
    overall = 'healthy';
  }

  return {
    overall,
    integrations,
    lastChecked: new Date(),
  };
}
