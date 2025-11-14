import { createClient } from '@/lib/supabase/server';

/**
 * Idempotency middleware for POST endpoints
 * Caches responses using Idempotency-Key header
 * Note: Requires user to be authenticated
 */
export async function withIdempotency(
  req: Request,
  handler: () => Promise<Response>
): Promise<Response> {
  const key = req.headers.get('Idempotency-Key');

  // If no idempotency key provided, execute normally
  if (!key) {
    return handler();
  }

  const supabase = await createClient();

  // Check for existing response
  const { data: found } = await supabase
    .from('http_idempotency')
    .select('*')
    .eq('key', key)
    .maybeSingle();

  if (found) {
    // Return cached response
    return new Response(JSON.stringify(found.response), {
      status: found.status,
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotent-Replay': 'true',
      },
    });
  }

  // Execute handler and cache result
  const res = await handler();
  const cloned = res.clone();
  const body = await cloned.json().catch(() => ({}));

  // Store response (fire and forget)
  await supabase
    .from('http_idempotency')
    .insert({
      key,
      response: body,
      status: cloned.status,
    })
    .catch((err) => {
      console.error('Failed to store idempotency key:', err);
    });

  return res;
}
