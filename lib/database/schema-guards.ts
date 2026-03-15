type ErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const warnedScopes = new Set<string>();

function errorText(error: ErrorLike | null | undefined) {
  return [error?.message, error?.details, error?.hint].filter(Boolean).join(' ').toLowerCase();
}

export function isMissingRelationError(error: ErrorLike | null | undefined, relationName: string): boolean {
  if (!error) return false;
  const text = errorText(error);
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    text.includes(`could not find the table 'public.${relationName.toLowerCase()}'`) ||
    text.includes(`relation "${relationName.toLowerCase()}" does not exist`) ||
    text.includes('schema cache')
  );
}

export function shouldSilenceMissingRelationError(
  scope: string,
  relationName: string,
  error: ErrorLike | null | undefined,
): boolean {
  if (!isMissingRelationError(error, relationName)) return false;
  const warningKey = `${scope}:${relationName}`;
  if (!warnedScopes.has(warningKey)) {
    warnedScopes.add(warningKey);
    console.warn(`[${scope}] ${relationName} is missing; returning fallback until migrations are applied.`);
  }
  return true;
}
