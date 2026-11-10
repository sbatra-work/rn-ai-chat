import type { Config } from '../config.ts';
import { createFakeProvider } from './fake.ts';
import { createOpenAiProvider } from './openai.ts';
import type { ChatProvider } from './types.ts';

export function createProvider(config: Config): ChatProvider {
  if (config.mode === 'fake') return createFakeProvider(config.fakeDelayMs);
  return createOpenAiProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  });
}
