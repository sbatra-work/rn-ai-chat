import { fetch as streamingFetch } from 'expo/fetch';
import { randomUUID } from 'expo-crypto';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
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

  // Give the navigator the same colors as the screens, so the header and
  // the screen transitions follow light and dark mode too.
  const navigationTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.border,
        primary: colors.primary,
      },
    };
  }, [colors, dark]);

  return (
    <SQLiteProvider databaseName="chat.db" onInit={migrate}>
      <AppServices>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              // An opaque header, so content starts below it instead of under it.
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="index" options={{ title: 'Chats' }} />
            <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
          </Stack>
        </ThemeProvider>
      </AppServices>
    </SQLiteProvider>
  );
}
