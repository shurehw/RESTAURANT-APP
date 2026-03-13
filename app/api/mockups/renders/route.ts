import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { createAdminClient } from '@/lib/supabase/server';

function getPresetSettings(
  qualityPreset: 'fast' | 'premium',
  qualityFast: Record<string, unknown> | null,
  qualityPremium: Record<string, unknown> | null,
): Record<string, unknown> {
  return qualityPreset === 'premium'
    ? (qualityPremium || {})
    : (qualityFast || {});
}

function creditsForPreset(qualityPreset: 'fast' | 'premium'): number {
  return qualityPreset === 'premium' ? 10 : 5;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      template_id,
      quality_preset,
      logo_asset_url = null,
      output_image_url = null,
      provider = 'manual',
      provider_model = null,
      status = 'completed',
      error_message = null,
      render_seconds = null,
    } = body || {};

    if (!template_id) {
      return NextResponse.json({ error: 'template_id is required' }, { status: 400 });
    }

    if (quality_preset && !['fast', 'premium'].includes(quality_preset)) {
      return NextResponse.json(
        { error: 'quality_preset must be fast or premium' },
        { status: 400 },
      );
    }

    if (!['pending', 'completed', 'failed'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be pending, completed, or failed' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { data: template } = await supabase
      .from('mockup_templates')
      .select('*')
      .eq('id', template_id)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const { data: version } = await supabase
      .from('mockup_template_versions')
      .select('*')
      .eq('template_id', template.id)
      .eq('org_id', ctx.orgId)
      .eq('version', template.current_version)
      .maybeSingle();

    if (!version) {
      return NextResponse.json(
        { error: 'Template current version not found' },
        { status: 409 },
      );
    }

    const preset = (quality_preset || template.default_quality_preset || 'fast') as 'fast' | 'premium';
    const settings = getPresetSettings(preset, version.quality_fast, version.quality_premium);

    const { data: render, error: insertErr } = await supabase
      .from('mockup_renders')
      .insert({
        org_id: ctx.orgId,
        template_id: template.id,
        template_version_id: version.id,
        template_version: version.version,
        quality_preset: preset,
        credits_used: creditsForPreset(preset),
        provider,
        provider_model,
        logo_asset_url,
        output_image_url,
        status,
        error_message,
        render_seconds,
        prompt_snapshot: version.prompt,
        settings_snapshot: settings,
        created_by: ctx.authUserId || null,
      })
      .select('*')
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ render });
  } catch (error) {
    console.error('[mockups/renders] POST failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: renders, error } = await supabase
      .from('mockup_renders')
      .select('*')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ renders: renders || [] });
  } catch (error) {
    console.error('[mockups/renders] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

