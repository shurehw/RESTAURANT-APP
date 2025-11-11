import { NextRequest } from 'next/server';

/**
 * Simple in-memory rate limiter using token bucket algorithm
 * For production, replace with Redis/Upstash
 */

type Bucket = {
  tokens: number;
  lastRefill: number;
};

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000; // 1 minute
const CAPACITY = 100; // requests per window
const REFILL_PER_MS = CAPACITY / WINDOW_MS;

/**
 * Rate limit middleware
 * Throws 429 if rate limit exceeded
 *
 * @param req - Next.js request
 * @param keyExtra - Additional key suffix for per-endpoint limits
 */
export function rateLimit(req: NextRequest, keyExtra = ''): void {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0] ||
    req.headers.get('x-real-ip') ||
    'ip-unknown';

  const key = `${ip}${keyExtra}`;
  const now = Date.now();

  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: CAPACITY, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on time elapsed
  const elapsed = now - bucket.lastRefill;
  const refill = elapsed * REFILL_PER_MS;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + refill);
  bucket.lastRefill = now;

  // Check if request allowed
  if (bucket.tokens < 1) {
    throw {
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      details: {
        retry_after: 60,
        limit: `${CAPACITY} requests per minute`,
      },
    };
  }

  // Consume token
  bucket.tokens -= 1;
  buckets.set(key, bucket);
}

/**
 * Cleanup old buckets every 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  const staleThreshold = now - WINDOW_MS * 5;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.lastRefill < staleThreshold) {
      buckets.delete(key);
    }
  }
}, 300_000);
