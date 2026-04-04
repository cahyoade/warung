import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { migrateDbIfNeeded } from '../src/database/Database';
import { LanguageProvider } from '../src/i18n/LanguageContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <LanguageProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <SQLiteProvider databaseName="warung.db" onInit={migrateDbIfNeeded} useSuspense>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="add-product" options={{ presentation: 'modal', title: 'Add Product' }} />
            <Stack.Screen name="add-customer" options={{ presentation: 'modal', title: 'Add Customer' }} />
            <Stack.Screen name="checkout" options={{ presentation: 'modal', title: 'Checkout' }} />
            <Stack.Screen name="redeem-points" options={{ presentation: 'modal', title: 'Redeem Points' }} />
          </Stack>
          <StatusBar style="auto" />
        </SQLiteProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
