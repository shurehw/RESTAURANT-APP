/**
 * lib/auth/require-user.ts
 * Convenience wrapper around resolveContext for routes expecting { user, profile }
 * Asserts org_id is present (requireContext already validates auth + org access)
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
      org_id: ctx.orgId as string,
      role: ctx.role,
    },
  };
}
