import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectionProvider } from './ConnectionProvider';
export function AppProviders({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient({ defaultOptions: {
    queries: { staleTime: 60_000, gcTime: 15 * 60_000, retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  } }));
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const listener = AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'));
    return () => listener.remove();
  }, []);
  return <SafeAreaProvider><QueryClientProvider client={client}><ConnectionProvider>{children}</ConnectionProvider></QueryClientProvider></SafeAreaProvider>;
}

