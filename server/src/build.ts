import { createApp, type Handler } from './app.ts';
import { readConfig, type EnvSource } from './config.ts';
import { createProvider } from './providers/index.ts';
import { createRateLimiter } from './rateLimit.ts';

/** Wire the real pieces together from environment variables. */
export function buildApp(env: EnvSource): { handler: Handler; mode: string } {
  const config = readConfig(env);
  const handler = createApp({
    provider: createProvider(config),
    rateLimiter: createRateLimiter({ limit: config.rateLimit, windowMs: config.rateWindowMs }),
    mode: config.mode,
    logError: (error) => console.error('[server]', error),
  });
  return { handler, mode: config.mode };
}
