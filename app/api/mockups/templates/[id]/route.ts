import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { createAdminClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ctx.isPlatformAdmin && !['owner', 'admin'].includes(ctx.role || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      name,
      category,
      is_active,
      default_quality_preset,
      prompt,
      quality_fast,
      quality_premium,
      notes,
    } = body || {};

    const supabase = createAdminClient();
    const { data: template, error: findErr } = await supabase
      .from('mockup_templates')
      .select('*')
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (findErr || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const updateTemplatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updateTemplatePayload.name = name;
    if (category !== undefined) updateTemplatePayload.category = category;
    if (is_active !== undefined) updateTemplatePayload.is_active = !!is_active;
    if (default_quality_preset !== undefined) {
      if (!['fast', 'premium'].includes(default_quality_preset)) {
        return NextResponse.json(
          { error: 'default_quality_preset must be fast or premium' },
          { status: 400 },
        );
      }
      updateTemplatePayload.default_quality_preset = default_quality_preset;
    }

    const versionChanging = (
      prompt !== undefined ||
      quality_fast !== undefined ||
      quality_premium !== undefined ||
      notes !== undefined
    );

    let createdVersion: any = null;
    if (versionChanging) {
      const { data: latest } = await supabase
        .from('mockup_template_versions')
        .select('*')
        .eq('template_id', template.id)
        .eq('org_id', ctx.orgId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = (latest?.version || template.current_version || 1) + 1;
      const { data: insertedVersion, error: versionErr } = await supabase
        .from('mockup_template_versions')
        .insert({
          template_id: template.id,
          org_id: ctx.orgId,
          version: nextVersion,
          prompt: prompt ?? latest?.prompt ?? '',
          quality_fast: quality_fast ?? latest?.quality_fast ?? {},
          quality_premium: quality_premium ?? latest?.quality_premium ?? {},
          notes: notes ?? latest?.notes ?? null,
          created_by: ctx.authUserId || null,
          created_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (versionErr) {
        return NextResponse.json({ error: versionErr.message }, { status: 500 });
      }

      createdVersion = insertedVersion;
      updateTemplatePayload.current_version = nextVersion;
    }

    const { data: updatedTemplate, error: updateErr } = await supabase
      .from('mockup_templates')
      .update(updateTemplatePayload)
      .eq('id', template.id)
      .eq('org_id', ctx.orgId)
      .select('*')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      template: updatedTemplate,
      created_version: createdVersion,
    });
  } catch (error) {
    console.error('[mockups/templates/:id] PATCH failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

