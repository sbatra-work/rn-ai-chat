import { fetch as streamingFetch } from 'expo/fetch';
import { randomUUID } from 'expo-crypto';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type ReactNode } from 'react';
import {
  createSqliteChatRepository,
  getOrCreateDeviceId,
  migrate,
} from '../features/chat/storage/sqliteChatRepository';
import { createChatClient } from '../lib/api/chatClient';
import { API_URL } from '../lib/config';
import { ServicesProvider, type Services } from '../lib/services';
import { useTheme } from '../lib/theme';

/**
 * The composition root. This is the only file that knows which real
 * storage and network implementations the app uses.
 */
function AppServices({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();

  const services = useMemo<Services>(() => {
    let deviceId: Promise<string> | undefined;
    return {
      repository: createSqliteChatRepository(db),
      chatClient: createChatClient({
        baseUrl: API_URL,
        // React Native's built-in fetch cannot read a response as a stream.
        fetchFn: streamingFetch,
        getDeviceId: () => (deviceId ??= getOrCreateDeviceId(db, randomUUID)),
      }),
      newId: randomUUID,
    };
  }, [db]);

  return <ServicesProvider value={services}>{children}</ServicesProvider>;
}

export default function RootLayout() {
  const { colors, dark } = useTheme();

  return (
    <SQLiteProvider databaseName="chat.db" onInit={migrate}>
      <AppServices>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Chats' }} />
          <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
        </Stack>
      </AppServices>
    </SQLiteProvider>
  );
}
