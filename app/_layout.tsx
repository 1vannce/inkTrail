import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../src/providers/AppProviders';
import { colors } from '../src/theme';
export default function RootLayout() {
  return <AppProviders><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="title/[id]" />
    <Stack.Screen name="connection" options={{ presentation: 'modal' }} />
  </Stack></AppProviders>;
}

