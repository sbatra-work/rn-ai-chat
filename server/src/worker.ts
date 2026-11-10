/**
 * Cloudflare Workers entry point.
 *
 *   npx wrangler deploy
 *   npx wrangler secret put LLM_API_KEY
 */
import type { Handler } from './app.ts';
import { buildApp } from './build.ts';
import type { EnvSource } from './config.ts';

let handler: Handler | undefined;

export default {
  fetch(request: Request, env: EnvSource): Promise<Response> {
    // Built once per isolate so the rate limiter keeps its counters.
    handler ??= buildApp(env).handler;
    return handler(request);
  },
};
