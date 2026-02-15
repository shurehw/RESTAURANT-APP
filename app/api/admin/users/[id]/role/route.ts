import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { updateUserRole } from '@/lib/database/user-management';
import type { UserRole } from '@/lib/nav/role-permissions';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id: userId } = await params;
    const body = await request.json();
    const { role } = body;

    if (!role) {
      return NextResponse.json(
        { error: 'role is required' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles: UserRole[] = ['owner', 'director', 'gm', 'agm', 'manager', 'exec_chef', 'sous_chef'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    await updateUserRole(userId, role);

    return NextResponse.json({ success: true });
  });
}
