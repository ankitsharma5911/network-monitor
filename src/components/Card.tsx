import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, shadow } from '../theme/theme';

export const Card: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
});

export const SectionTitle: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <View style={{ marginBottom: spacing.sm }}>
    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{title}</Text>
    {subtitle ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{subtitle}</Text> : null}
  </View>
);

export const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={{ fontSize: 20, fontWeight: '700', color: color ?? colors.text }}>{value}</Text>
    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{label}</Text>
  </View>
);
