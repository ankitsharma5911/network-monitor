import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { listEvents, deleteEvent, clearAll } from '../services/storage';
import { networkMonitor } from '../services/networkMonitor';
import { EventStatus, NetworkEvent } from '../types';
import { Card } from '../components/Card';
import { colors, spacing, radii, shadow } from '../theme/theme';
import { formatTime, eventDuration, statusLabel, statusColor } from '../utils/format';

const csvCell = (v: unknown) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);

export default function HistoryScreen({ navigation }: any) {
  const [events, setEvents] = useState<NetworkEvent[]>([]);
  const [filter, setFilter] = useState<'all' | EventStatus>('all');

  useFocusEffect(
    useCallback(() => {
      let alive = true; // drop results from a previous filter that resolve late
      const load = () => {
        listEvents(filter === 'all' ? undefined : filter)
          .then((e) => alive && setEvents(e))
          .catch(() => {});
      };
      load();
      const unsubscribe = networkMonitor.subscribe(load);
      return () => {
        alive = false;
        unsubscribe();
      };
    }, [filter])
  );

  const onClear = () => {
    Alert.alert('Clear history', 'Delete all recorded events?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await clearAll(); setEvents([]); } },
    ]);
  };

  const onExport = async () => {
    try {
      const rows = await listEvents(undefined, -1);
      const header = 'id,status,started,ended,durationSec,peakLatencyMs,connection,latitude,longitude,place,note';
      const lines = rows.map((r) =>
        [
          r.id,
          r.status,
          formatTime(r.startedAt),
          r.endedAt ? formatTime(r.endedAt) : null,
          r.durationMs === null ? null : (r.durationMs / 1000).toFixed(1),
          r.latencyMs,
          r.connectionType,
          r.latitude,
          r.longitude,
          r.placeLabel,
          r.note,
        ].map(csvCell).join(',')
      );
      // A file, not Share.share(text): large logs overflow Android's ~1 MB intent limit and crash.
      const file = new File(Paths.cache, 'network-log.csv');
      await file.write([header, ...lines].join('\n'));
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Network log export' });
    } catch (e) {
      Alert.alert('Export failed', String(e));
    }
  };

  const renderItem = ({ item }: { item: NetworkEvent }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => navigation.navigate('EventDetail', { id: item.id })}
      onLongPress={() =>
        Alert.alert('Delete event?', undefined, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await deleteEvent(item.id);
              setEvents((es) => es.filter((e) => e.id !== item.id));
            },
          },
        ])
      }
    >
      <View style={[styles.dot, { backgroundColor: statusColor(item.status) }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{statusLabel(item.status)}</Text>
        <Text style={styles.sub}>{formatTime(item.startedAt)} · {item.connectionType ?? '—'}</Text>
        <Text style={styles.sub}>
          Duration {eventDuration(item, networkMonitor.activeId)}
          {item.status === 'slow' && item.latencyMs !== null ? ` · Peak ${item.latencyMs} ms` : ''}
        </Text>
        {item.placeLabel ? <Text style={styles.place}>📍 {item.placeLabel}</Text> : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.filters}>
        {(['all', 'down', 'slow'] as const).map((f) => (
          <TouchableOpacity key={f} style={[styles.chip, filter === f && styles.chipActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'all' ? 'All' : f === 'down' ? 'Outages' : 'Slow'}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onExport}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClear} style={{ marginLeft: 16 }}>
          <Text style={{ color: colors.danger, fontWeight: '600' }}>Clear</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={events}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={<Card><Text style={{ color: colors.muted, textAlign: 'center' }}>No events recorded yet.</Text></Card>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, paddingBottom: 0 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.border, marginRight: 8 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text },
  chipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, ...shadow },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, marginRight: 12 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  place: { fontSize: 12, color: colors.primary, marginTop: 4 },
});
