import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, uuid } from '@/lib/validate';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

const backtestSchema = z.object({
  venue_id: uuid,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scenario: z.enum(['lean', 'buffered', 'safe']).optional().default('buffered'),
  rolling: z.boolean().optional().default(false),
  train_weeks: z.number().int().min(1).max(26).optional().default(4),
});

/**
 * POST /api/labor/optimize/backtest
 * Run backtest comparing profiles vs historical actuals.
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':active-covers-backtest');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const validated = validate(backtestSchema, body);
    assertVenueAccess(validated.venue_id, venueIds);

    const scriptDir = path.join(process.cwd(), 'python-services');
    let command = `python -m labor_optimizer.cli backtest --venue-id ${validated.venue_id} --start ${validated.start_date} --end ${validated.end_date} --scenario ${validated.scenario}`;

    if (validated.rolling) {
      command += ` --rolling --train-weeks ${validated.train_weeks}`;
    }

    let stdout: string;
    let stderr: string;
    try {
      const result = await execAsync(command, {
        env: { ...process.env, PYTHONPATH: scriptDir, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        cwd: scriptDir,
        timeout: 300000,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execError: any) {
      console.error('Backtest failed:', execError.stderr || execError.message);
      const error: any = new Error(`Backtest failed: ${execError.message}`);
      error.status = 500;
      error.code = 'BACKTEST_ERROR';
      error.details = (execError.stderr || execError.stdout || '').slice(-500);
      throw error;
    }

    if (stderr && !stderr.includes('warning')) console.error('Backtest stderr:', stderr);

    return NextResponse.json({ success: true, output: stdout });
  });
}
