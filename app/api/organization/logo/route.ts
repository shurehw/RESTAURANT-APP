/**
 * Organization Logo Upload API
 * Allows organizations to upload logos for branded documents (SOPs, reports, etc.)
 *
 * POST /api/organization/logo - Upload logo file
 * PUT /api/organization/logo - Update logo URL (for externally hosted images)
 * DELETE /api/organization/logo - Remove logo
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];

/**
 * POST: Upload logo file to Supabase Storage
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const orgId = formData.get('org_id') as string;

    if (!file || !orgId) {
      return NextResponse.json(
        { error: 'file and org_id are required' },
        { status: 400 }
      );
    }

    // Verify user has admin access
    const isAdmin = await verifyOrgAdmin(request, orgId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed types: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const filename = `${orgId}/logo-${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await (supabase as any)
      .storage
      .from('organization-assets')
      .upload(filename, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Logo upload error:', uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = (supabase as any)
      .storage
      .from('organization-assets')
      .getPublicUrl(filename);

    const logoUrl = urlData.publicUrl;

    // Delete old logo if it exists
    const { data: org } = await (supabase as any)
      .from('organizations')
      .select('logo_url')
      .eq('id', orgId)
      .single();

    if (org?.logo_url && org.logo_url.includes('organization-assets')) {
      // Extract filename from URL
      const oldFilename = org.logo_url.split('/organization-assets/')[1];
      if (oldFilename && oldFilename !== filename) {
        await (supabase as any)
          .storage
          .from('organization-assets')
          .remove([oldFilename]);
      }
    }

    // Update organization logo_url
    const { error: updateError } = await (supabase as any)
      .from('organizations')
      .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq('id', orgId);

    if (updateError) {
      console.error('Logo URL update error:', updateError);
      return NextResponse.json(
        { error: `Failed to update logo URL: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      logo_url: logoUrl,
      message: 'Logo uploaded successfully',
    });
  } catch (error: any) {
    console.error('Logo upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT: Update logo URL (for externally hosted images)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { org_id: orgId, logo_url: logoUrl } = body;

    if (!orgId || !logoUrl) {
      return NextResponse.json(
        { error: 'org_id and logo_url are required' },
        { status: 400 }
      );
    }

    // Verify user has admin access
    const isAdmin = await verifyOrgAdmin(request, orgId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Validate URL format
    try {
      new URL(logoUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid logo_url format' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Update organization logo_url
    const { error: updateError } = await (supabase as any)
      .from('organizations')
      .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq('id', orgId);

    if (updateError) {
      console.error('Logo URL update error:', updateError);
      return NextResponse.json(
        { error: `Failed to update logo URL: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      logo_url: logoUrl,
      message: 'Logo URL updated successfully',
    });
  } catch (error: any) {
    console.error('Logo URL update error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Remove logo
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json(
        { error: 'org_id is required' },
        { status: 400 }
      );
    }

    // Verify user has admin access
    const isAdmin = await verifyOrgAdmin(request, orgId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const supabase = getServiceClient();

    // Get current logo URL
    const { data: org } = await (supabase as any)
      .from('organizations')
      .select('logo_url')
      .eq('id', orgId)
      .single();

    // Delete from storage if it's a Supabase-hosted image
    if (org?.logo_url && org.logo_url.includes('organization-assets')) {
      const filename = org.logo_url.split('/organization-assets/')[1];
      if (filename) {
        await (supabase as any)
          .storage
          .from('organization-assets')
          .remove([filename]);
      }
    }

    // Remove logo_url from organization
    const { error: updateError } = await (supabase as any)
      .from('organizations')
      .update({ logo_url: null, updated_at: new Date().toISOString() })
      .eq('id', orgId);

    if (updateError) {
      console.error('Logo removal error:', updateError);
      return NextResponse.json(
        { error: `Failed to remove logo: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Logo removed successfully',
    });
  } catch (error: any) {
    console.error('Logo removal error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Verify user has admin access to organization
 */
async function verifyOrgAdmin(request: NextRequest, orgId: string): Promise<boolean> {
  try {
    const supabase = getServiceClient();
    const userId = await getUserId(request);

    if (!userId) {
      return false;
    }

    const { data } = await (supabase as any)
      .from('organization_users')
      .select(`
        organization_id,
        user_roles!inner(role)
      `)
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .in('user_roles.role', ['admin', 'owner'])
      .maybeSingle();

    return !!data;
  } catch (error) {
    console.error('Error verifying org admin:', error);
    return false;
  }
}

/**
 * Get user ID from request
 */
async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getServiceClient();
    const { data, error } = await (supabase as any).auth.getUser(token);

    if (error || !data?.user) {
      return null;
    }

    return data.user.id;
  } catch (error) {
    console.error('Error getting user ID:', error);
    return null;
  }
}
