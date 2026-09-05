import type { Context } from 'hono';

type Bucket = { tokens: number; last: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(options?: { capacity?: number; refillPerSec?: number; keyPrefix?: string }) {
  const capacity = options?.capacity ?? 60;
  const refillPerSec = options?.refillPerSec ?? 1; // tokens per second
  const keyPrefix = options?.keyPrefix ?? 'rl:';

  return async (c: Context, next: () => Promise<any>) => {
    try {
      // key: userId if present, otherwise ip header, otherwise anonymous
      const userId = c.get<string>('userId');
      const ip = c.req.headers.get('x-forwarded-for') || c.req.headers.get('x-real-ip') || c.req.conn?.remoteAddress || 'anon';
      const key = `${keyPrefix}${userId ?? ip}`;

      const now = Date.now() / 1000;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { tokens: capacity, last: now };
        buckets.set(key, bucket);
      }

      // refill
      const elapsed = now - bucket.last;
      if (elapsed > 0) {
        const refill = elapsed * refillPerSec;
        bucket.tokens = Math.min(capacity, bucket.tokens + refill);
        bucket.last = now;
      }

      if (bucket.tokens < 1) {
        // Too many requests
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }

      bucket.tokens -= 1;
      // attach remaining to headers
      c.header('X-RateLimit-Limit', String(capacity));
      c.header('X-RateLimit-Remaining', String(Math.floor(bucket.tokens)));

      return await next();
    } catch (err) {
      console.error('Rate limit middleware error', err);
      return await next();
    }
  };
}
