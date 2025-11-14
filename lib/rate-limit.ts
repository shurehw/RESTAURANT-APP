import { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';

/**
 * Distributed rate limiter using Upstash Redis
 * Implements sliding window algorithm for accurate rate limiting
 */

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const WINDOW_SECONDS = 60; // 1 minute window
const MAX_REQUESTS = 100; // requests per window

/**
 * Rate limit middleware using Upstash Redis
 * Throws 429 if rate limit exceeded
 *
 * @param req - Next.js request
 * @param keyExtra - Additional key suffix for per-endpoint limits
 */
export async function rateLimit(req: NextRequest, keyExtra = ''): Promise<void> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0] ||
    req.headers.get('x-real-ip') ||
    'ip-unknown';

  const key = `ratelimit:${ip}${keyExtra}`;
  const now = Date.now();
  const windowStart = now - WINDOW_SECONDS * 1000;

  // Use Redis pipeline for atomic operations
  const pipeline = redis.pipeline();

  // Remove old entries outside the sliding window
  pipeline.zremrangebyscore(key, 0, windowStart);

  // Count requests in current window
  pipeline.zcard(key);

  // Add current request with timestamp
  pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` });

  // Set expiry to cleanup old keys
  pipeline.expire(key, WINDOW_SECONDS * 2);

  const results = await pipeline.exec();
  const requestCount = (results[1] as number) || 0;

  if (requestCount >= MAX_REQUESTS) {
    throw {
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      details: {
        retry_after: WINDOW_SECONDS,
        limit: `${MAX_REQUESTS} requests per ${WINDOW_SECONDS} seconds`,
      },
    };
  }
}

/**
 * Check rate limit without consuming a token
 * Useful for displaying remaining quota to users
 */
export async function checkRateLimit(
  req: NextRequest,
  keyExtra = ''
): Promise<{ remaining: number; limit: number; resetAt: Date }> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0] ||
    req.headers.get('x-real-ip') ||
    'ip-unknown';

  const key = `ratelimit:${ip}${keyExtra}`;
  const now = Date.now();
  const windowStart = now - WINDOW_SECONDS * 1000;

  // Count requests in current window
  const requestCount = await redis.zcount(key, windowStart, now);
  const remaining = Math.max(0, MAX_REQUESTS - requestCount);
  const resetAt = new Date(now + WINDOW_SECONDS * 1000);

  return {
    remaining,
    limit: MAX_REQUESTS,
    resetAt,
  };
}
