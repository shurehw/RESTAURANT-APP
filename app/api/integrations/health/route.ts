/**
 * Integration Health Check API
 * Returns status of all external integrations
 */

import { NextResponse } from 'next/server';
import { getSystemHealth } from '@/lib/integrations/health-check';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const health = await getSystemHealth();
    return NextResponse.json(health);
  } catch (error: any) {
    return NextResponse.json(
      {
        overall: 'down',
        integrations: [],
        lastChecked: new Date(),
        error: error.message,
      },
      { status: 500 }
    );
  }
}
