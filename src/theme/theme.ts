import { Platform } from 'react-native';

export const colors = {
  bg: '#f6f7fb',
  card: '#ffffff',
  text: '#1a1d2e',
  muted: '#6b7280',
  border: '#e5e7eb',
  primary: '#2563eb',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  subtle: '#f3f4f6',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radii = { sm: 8, md: 12, lg: 16, xl: 24 };

export const typography = {
  h1: { fontSize: 24, fontWeight: '700' as const },
  h2: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 15 },
  caption: { fontSize: 12, color: '#6b7280' },
};

export const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
  android: { elevation: 2 },
  default: {},
});
