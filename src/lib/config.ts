import { Platform } from 'react-native';

/**
 * Where the chat server lives. This is an address, not a secret: the model
 * API key stays on the server and is never part of the app bundle.
 *
 * Set EXPO_PUBLIC_API_URL to override, for example with your computer's LAN
 * address when running on a physical phone.
 */
const DEFAULT_API_URL = Platform.select({
  // The Android emulator reaches the host machine through this address.
  android: 'http://10.0.2.2:8787',
  default: 'http://localhost:8787',
});

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');
