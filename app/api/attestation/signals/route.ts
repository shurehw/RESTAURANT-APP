/**
 * Attestation Signals API
 *
 * GET /api/attestation/signals?attestation_id=...
 *   Returns all extracted signals for a specific attestation.
 *   Safe for managers — these are structured extractions from their own text.
 *
 * Prior night context (commitments, patterns) is now in the operator
 * intelligence system — see /api/operator/intelligence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSignalsForAttestation } from '@/lib/database/signal-outcomes';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const attestationId = searchParams.get('attestation_id');
    if (!attestationId) {
      return NextResponse.json(
        { error: 'attestation_id is required' },
        { status: 400 },
      );
    }

    const signals = await getSignalsForAttestation(attestationId);
    return NextResponse.json({ success: true, signals });
  } catch (error: any) {
    console.error('[attestation/signals] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
