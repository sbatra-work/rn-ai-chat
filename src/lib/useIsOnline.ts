import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * True unless the device reports that it has no connection.
 *
 * "Unknown" counts as online, so the app never blocks sending on a guess.
 * A request that fails anyway is handled by the normal error and retry path.
 */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
  }, []);

  return online;
}
