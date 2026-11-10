/**
 * Fixed-window rate limiter kept in memory.
 *
 * Good enough for one process. On Cloudflare Workers each isolate has its
 * own memory, so a real deployment should move the counters to a Durable
 * Object or the Workers rate limiting binding. The interface stays the same.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. Only meaningful when blocked. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

interface Options {
  limit: number;
  windowMs: number;
  /** Injected so tests can move time forward without waiting. */
  now?: () => number;
  /** Cap on tracked keys, so a flood of made-up IDs cannot eat memory. */
  maxKeys?: number;
}

interface Window {
  startedAt: number;
  count: number;
}

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxKeys = 10_000,
}: Options): RateLimiter {
  const windows = new Map<string, Window>();

  function dropExpired(time: number): void {
    for (const [key, window] of windows) {
      if (time - window.startedAt >= windowMs) windows.delete(key);
    }
  }

  return {
    check(key) {
      const time = now();
      let window = windows.get(key);

      if (!window || time - window.startedAt >= windowMs) {
        if (windows.size >= maxKeys) dropExpired(time);
        if (windows.size >= maxKeys) {
          // Still full of live windows: drop the oldest one.
          const oldest = windows.keys().next().value;
          if (oldest !== undefined) windows.delete(oldest);
        }
        window = { startedAt: time, count: 0 };
        windows.set(key, window);
      }

      if (window.count >= limit) {
        const msLeft = window.startedAt + windowMs - time;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil(msLeft / 1000)),
        };
      }

      window.count += 1;
      return { allowed: true, remaining: limit - window.count, retryAfterSeconds: 0 };
    },
  };
}
