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

const forecastSchema = z.object({
  venue_id: uuid,
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scenarios: z.string().optional().default('lean,buffered,safe'),
});

const pipelineSchema = z.object({
  venue_id: uuid,
  venue_name: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lookback: z.number().int().min(1).max(52).optional().default(8),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  skip_import: z.boolean().optional().default(true),
});

/**
 * POST /api/labor/optimize/active-covers
 * Run forecast generation for a venue and week.
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':active-covers-forecast');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const action = body.action || 'forecast';

    if (action === 'pipeline') {
      // Full pipeline
      const validated = validate(pipelineSchema, body);
      assertVenueAccess(validated.venue_id, venueIds);

      const scriptDir = path.join(process.cwd(), 'python-services');
      let command = `python -m labor_optimizer.cli full-pipeline --venue-id ${validated.venue_id}`;
      if (validated.venue_name) command += ` --venue-name "${validated.venue_name}"`;
      if (validated.date) command += ` --date ${validated.date}`;
      command += ` --lookback ${validated.lookback}`;
      if (validated.week_start) command += ` --week-start ${validated.week_start}`;
      if (validated.skip_import) command += ' --skip-import';

      const { stdout, stderr } = await execAsync(command, {
        env: { ...process.env, PYTHONPATH: scriptDir, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        cwd: scriptDir,
        timeout: 180000,
      });

      if (stderr && !stderr.includes('warning')) console.error('Pipeline stderr:', stderr);

      return NextResponse.json({ success: true, output: stdout });
    } else {
      // Forecast only
      const validated = validate(forecastSchema, body);
      assertVenueAccess(validated.venue_id, venueIds);

      const scriptDir = path.join(process.cwd(), 'python-services');
      const command = `python -m labor_optimizer.cli forecast --venue-id ${validated.venue_id} --week-start ${validated.week_start} --scenarios ${validated.scenarios}`;

      const { stdout, stderr } = await execAsync(command, {
        env: { ...process.env, PYTHONPATH: scriptDir, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        cwd: scriptDir,
        timeout: 120000,
      });

      if (stderr && !stderr.includes('warning')) console.error('Forecast stderr:', stderr);

      return NextResponse.json({ success: true, output: stdout });
    }
  });
}
