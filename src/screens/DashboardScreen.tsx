import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LiveStatus } from '../types';
import { networkMonitor } from '../services/networkMonitor';
import { getStats, Stats } from '../services/storage';
import { Card, SectionTitle, Stat } from '../components/Card';
import { colors, spacing, radii, shadow } from '../theme/theme';
import { formatDuration, formatTime } from '../utils/format';

const LIVE_LABEL = { ok: 'Online', slow: 'Slow connection', down: 'Offline' };
const LIVE_COLOR = { ok: colors.success, slow: colors.warning, down: colors.danger };

export default function DashboardScreen() {
  const [live, setLive] = useState<LiveStatus | null>(networkMonitor.live);
  const [running, setRunning] = useState(networkMonitor.isRunning());
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setLive(networkMonitor.live);
    setRunning(networkMonitor.isRunning());
    getStats().then(setStats).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      if (!networkMonitor.live) networkMonitor.refresh(); // show live status even while logging is stopped
      return networkMonitor.subscribe(load);
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await networkMonitor.refresh();
    setRefreshing(false);
  };

  const toggleMonitoring = () => {
    networkMonitor.setEnabled(!running).catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.statusCard}>
        <View style={[styles.statusDot, { backgroundColor: live ? LIVE_COLOR[live.status] : colors.muted }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusText}>{live ? LIVE_LABEL[live.status] : 'Checking…'}</Text>
          <Text style={styles.statusSub}>
            {live ? `${live.type}${live.latencyMs !== null ? ` · ${live.latencyMs} ms` : ''}` : ''}
            {running ? '' : ' · logging stopped'}
          </Text>
        </View>
        <TouchableOpacity style={[styles.toggleBtn, { backgroundColor: running ? colors.danger : colors.success }]} onPress={toggleMonitoring}>
          <Text style={styles.toggleText}>{running ? 'Stop' : 'Start'}</Text>
        </TouchableOpacity>
      </View>

      <Card>
        <SectionTitle title="Live metrics" subtitle={live ? `Checked ${formatTime(live.checkedAt)}` : undefined} />
        <View style={styles.row}>
          <Stat label="Latency (ms)" value={String(live?.latencyMs ?? '—')} color={live?.status === 'slow' ? colors.warning : colors.text} />
          <Stat label="Type" value={live?.type ?? '—'} />
        </View>
      </Card>

      <Card>
        <SectionTitle title="Summary" subtitle="All recorded events" />
        {stats ? (
          <>
            <View style={styles.row}>
              <Stat label="Total events" value={String(stats.total)} />
              <Stat label="Outages" value={String(stats.downs)} color={colors.danger} />
              <Stat label="Slow" value={String(stats.slows)} color={colors.warning} />
            </View>
            <View style={{ height: 12 }} />
            <View style={styles.row}>
              <Stat label="Total downtime" value={formatDuration(stats.totalDowntimeMs)} color={colors.danger} />
              <Stat label="Avg slow latency" value={stats.avgSlowLatencyMs ? `${stats.avgSlowLatencyMs} ms` : '—'} />
            </View>
          </>
        ) : null}
      </Card>

      {stats?.lastDownAt ? (
        <Card>
          <SectionTitle title="Last outage" />
          <Text style={{ color: colors.muted }}>Recorded at {formatTime(stats.lastDownAt)}</Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  statusDot: { width: 14, height: 14, borderRadius: 7, marginRight: spacing.md },
  statusText: { fontSize: 18, fontWeight: '700', color: colors.text },
  statusSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.sm },
  toggleText: { color: '#fff', fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
