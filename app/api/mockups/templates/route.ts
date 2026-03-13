import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: templates, error } = await supabase
      .from('mockup_templates')
      .select(`
        id,
        name,
        category,
        is_active,
        current_version,
        default_quality_preset,
        created_at,
        updated_at,
        mockup_template_versions (
          id,
          version,
          prompt,
          quality_fast,
          quality_premium,
          notes,
          created_at
        )
      `)
      .eq('org_id', ctx.orgId)
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const normalized = (templates || []).map((t: any) => {
      const versions = (t.mockup_template_versions || [])
        .sort((a: any, b: any) => b.version - a.version);
      const latest = versions[0] || null;
      return {
        id: t.id,
        name: t.name,
        category: t.category,
        is_active: t.is_active,
        current_version: t.current_version,
        default_quality_preset: t.default_quality_preset,
        latest_version: latest,
        versions,
        created_at: t.created_at,
        updated_at: t.updated_at,
      };
    });

    return NextResponse.json({ templates: normalized });
  } catch (error) {
    console.error('[mockups/templates] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ctx.isPlatformAdmin && !['owner', 'admin'].includes(ctx.role || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      category,
      prompt,
      default_quality_preset = 'fast',
      quality_fast = {},
      quality_premium = {},
      notes = null,
    } = body || {};

    if (!name || !category || !prompt) {
      return NextResponse.json(
        { error: 'name, category, and prompt are required' },
        { status: 400 },
      );
    }

    if (!['fast', 'premium'].includes(default_quality_preset)) {
      return NextResponse.json(
        { error: 'default_quality_preset must be fast or premium' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data: template, error: insertTemplateErr } = await supabase
      .from('mockup_templates')
      .insert({
        org_id: ctx.orgId,
        name,
        category,
        current_version: 1,
        default_quality_preset,
        created_by: ctx.authUserId || null,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (insertTemplateErr) {
      return NextResponse.json({ error: insertTemplateErr.message }, { status: 500 });
    }

    const { data: version, error: versionErr } = await supabase
      .from('mockup_template_versions')
      .insert({
        template_id: template.id,
        org_id: ctx.orgId,
        version: 1,
        prompt,
        quality_fast,
        quality_premium,
        notes,
        created_by: ctx.authUserId || null,
        created_at: now,
      })
      .select('*')
      .single();

    if (versionErr) {
      return NextResponse.json({ error: versionErr.message }, { status: 500 });
    }

    return NextResponse.json({
      template: {
        ...template,
        latest_version: version,
      },
    });
  } catch (error) {
    console.error('[mockups/templates] POST failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
