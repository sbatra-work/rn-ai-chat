import { createContext, useContext, type ReactNode } from 'react';
import type { ChatRepository } from '../features/chat/storage/chatRepository';
import type { ChatClient } from './api/chatClient';

/**
 * The outside world, as seen by screens: storage and the network.
 *
 * Screens get these from context instead of importing them. The real ones
 * are built once in the root layout. Tests pass in fakes, so a screen test
 * needs no native modules and no module mocking.
 */
export interface Services {
  repository: ChatRepository;
  chatClient: ChatClient;
  /** Makes IDs for new messages and conversations. */
  newId: () => string;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ value, children }: { value: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>.');
  return services;
}
