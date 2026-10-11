import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
export default function TabLayout() {
  const { bottom } = useSafeAreaInsets();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border, height: 64 + Math.max(bottom, 12), paddingTop: 10, paddingBottom: Math.max(bottom, 12) },
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 3 }, sceneStyle: { backgroundColor: colors.background } }}>
    <Tabs.Screen name="index" options={{ title: 'Discover', tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="library" options={{ title: 'My library', tabBarIcon: ({ color, size }) => <Ionicons name="bookmarks-outline" color={color} size={size} /> }} />
  </Tabs>;
}

