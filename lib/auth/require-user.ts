/**
 * lib/auth/require-user.ts
 * Convenience wrapper around resolveContext for routes expecting { user, profile }
 */

import { requireContext } from './resolveContext';

export async function requireUser() {
  const ctx = await requireContext();

  return {
    user: {
      id: ctx.authUserId,
      email: ctx.email,
    },
    profile: {
      org_id: ctx.orgId,
      role: ctx.role,
    },
  };
}
