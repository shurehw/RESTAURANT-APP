import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// PUT - Update a preset
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await request.json();

  const { preset_name, description, settings, is_org_default } = body;

  // Check if preset exists and is not a system default
  const { data: existing } = await supabase
    .from('proforma_setting_presets')
    .select('is_system_default')
    .eq('id', id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  }

  if (existing.is_system_default) {
    return NextResponse.json(
      { error: 'Cannot modify system default presets' },
      { status: 403 }
    );
  }

  // If setting as org default, unset any existing org default
  if (is_org_default) {
    await supabase
      .from('proforma_setting_presets')
      .update({ is_org_default: false })
      .eq('is_org_default', true)
      .neq('id', id);
  }

  const { data: preset, error } = await supabase
    .from('proforma_setting_presets')
    .update({
      preset_name,
      description,
      settings,
      is_org_default: is_org_default || false,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(preset);
}

// DELETE - Delete a preset
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  // Check if preset is a system default (these cannot be deleted)
  const { data: existing } = await supabase
    .from('proforma_setting_presets')
    .select('is_system_default')
    .eq('id', id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  }

  if (existing.is_system_default) {
    return NextResponse.json(
      { error: 'Cannot delete system default presets' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('proforma_setting_presets')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
