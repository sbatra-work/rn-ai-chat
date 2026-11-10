/**
 * Server settings, read once from environment variables.
 * Works the same on Node (`process.env`) and Cloudflare Workers (`env`).
 */

export interface Config {
  /** "fake" needs no key and gives the same answer every time. */
  mode: 'fake' | 'openai';
  apiKey: string;
  /** Any OpenAI-compatible endpoint: OpenAI, OpenRouter, Groq, Ollama. */
  baseUrl: string;
  model: string;
  /** Requests allowed per device in each window. */
  rateLimit: number;
  rateWindowMs: number;
  /** Pause between tokens in fake mode, so streaming is visible. */
  fakeDelayMs: number;
}

export type EnvSource = Record<string, string | undefined>;

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a whole number, got "${raw}"`);
  }
  return value;
}

export function readConfig(env: EnvSource): Config {
  const apiKey = env.LLM_API_KEY ?? '';
  const requested = env.LLM_MODE ?? (apiKey ? 'openai' : 'fake');
  if (requested !== 'fake' && requested !== 'openai') {
    throw new Error(`LLM_MODE must be "fake" or "openai", got "${requested}"`);
  }
  if (requested === 'openai' && !apiKey) {
    throw new Error('LLM_MODE=openai needs LLM_API_KEY');
  }

  return {
    mode: requested,
    apiKey,
    baseUrl: (env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: env.LLM_MODEL ?? 'gpt-4o-mini',
    rateLimit: positiveInt(env.RATE_LIMIT, 20, 'RATE_LIMIT'),
    rateWindowMs: positiveInt(env.RATE_WINDOW_MS, 60_000, 'RATE_WINDOW_MS'),
    fakeDelayMs: positiveInt(env.FAKE_DELAY_MS, 35, 'FAKE_DELAY_MS'),
  };
}
