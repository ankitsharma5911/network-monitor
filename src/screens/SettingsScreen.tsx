import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TextInput, Alert, TouchableOpacity, Keyboard, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { getSettings, saveSettings, getStats, clearAll, Stats } from '../services/storage';
import { AppSettings } from '../types';
import { Card, SectionTitle } from '../components/Card';
import { colors, spacing, radii } from '../theme/theme';
import { formatDuration } from '../utils/format';

const MIN_THRESHOLD = 100;
const MAX_THRESHOLD = 60_000;

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [threshold, setThreshold] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setThreshold(String(s.slowThresholdMs));
      })
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      getStats().then(setStats).catch(() => {});
      // Leaving the tab with the keyboard up blurs the input, so a typed threshold still gets saved.
      return () => Keyboard.dismiss();
    }, [])
  );

  const update = async (patch: Partial<AppSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    await saveSettings(patch);
  };

  const onThresholdDone = async () => {
    if (!settings) return;
    const v = Math.round(Number(threshold));
    if (!(v >= MIN_THRESHOLD && v <= MAX_THRESHOLD)) {
      Alert.alert('Invalid', `Threshold must be between ${MIN_THRESHOLD} and ${MAX_THRESHOLD} ms.`);
      setThreshold(String(settings.slowThresholdMs));
      return;
    }
    setThreshold(String(v));
    await update({ slowThresholdMs: v });
  };

  const onCaptureLocation = async (on: boolean) => {
    if (on && (await Location.requestForegroundPermissionsAsync()).status !== 'granted') {
      Alert.alert('Location permission needed', 'Allow location access for Network Monitor to tag events with where they happened.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    await update({ captureLocation: on });
  };

  if (!settings) return null;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Card>
        <SectionTitle title="Monitoring" subtitle="Start or stop logging from the Monitor tab." />
        <Row label="Capture location" value={
          <Switch value={settings.captureLocation} onValueChange={(v) => { onCaptureLocation(v).catch(() => {}); }} />
        } />
        <View style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.text, marginBottom: 4 }}>Slow threshold (ms)</Text>
          <TextInput
            value={threshold}
            onChangeText={setThreshold}
            onEndEditing={() => { onThresholdDone().catch(() => {}); }}
            keyboardType="number-pad"
            style={styles.input}
          />
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
            A connection is flagged "slow" when latency exceeds this value.
          </Text>
        </View>
      </Card>

      <Card>
        <SectionTitle title="Data" />
        <Row label="Total events" value={<Text style={{ color: colors.text }}>{stats?.total ?? 0}</Text>} />
        <Row label="Outages" value={<Text style={{ color: colors.danger }}>{stats?.downs ?? 0}</Text>} />
        <Row label="Slow events" value={<Text style={{ color: colors.warning }}>{stats?.slows ?? 0}</Text>} />
        <Row label="Total downtime" value={<Text style={{ color: colors.text }}>{stats ? formatDuration(stats.totalDowntimeMs) : '—'}</Text>} />
        <TouchableOpacity
          style={styles.dangerBtn}
          onPress={() => Alert.alert('Clear all?', 'This deletes all recorded events.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await clearAll(); setStats(await getStats()); } },
          ])}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Clear all history</Text>
        </TouchableOpacity>
      </Card>

      <Card>
        <SectionTitle title="About" />
        <Row label="App" value={<Text style={{ color: colors.text }}>Network Monitor</Text>} />
        <Row label="Version" value={<Text style={{ color: colors.text }}>{Constants.expoConfig?.version ?? '—'}</Text>} />
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: spacing.sm }}>
          Records when your internet goes down or becomes slow, and logs the location of the place where it happened.
        </Text>
      </Card>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.text }}>{label}</Text>
      {value}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, color: colors.text },
  dangerBtn: { marginTop: spacing.md, backgroundColor: colors.danger, padding: 12, borderRadius: radii.md, alignItems: 'center' },
});
