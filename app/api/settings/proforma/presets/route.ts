import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - List all presets for the tenant
export async function GET() {
  const supabase = await createClient();

  const { data: presets, error } = await supabase
    .from('proforma_setting_presets')
    .select('*')
    .order('is_system_default', { ascending: false })
    .order('is_org_default', { ascending: false })
    .order('preset_name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(presets);
}

// POST - Create a new preset
export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();

  const { preset_name, description, settings, is_org_default } = body;

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // If setting as org default, unset any existing org default
  if (is_org_default) {
    await supabase
      .from('proforma_setting_presets')
      .update({ is_org_default: false })
      .eq('is_org_default', true);
  }

  const { data: preset, error } = await supabase
    .from('proforma_setting_presets')
    .insert({
      preset_name,
      description,
      settings,
      is_org_default: is_org_default || false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(preset);
}
