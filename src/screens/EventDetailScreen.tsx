import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NetworkEvent } from '../types';
import { getEvent, updateEvent } from '../services/storage';
import { networkMonitor } from '../services/networkMonitor';
import { Card } from '../components/Card';
import { colors, spacing, radii } from '../theme/theme';
import { formatTime, eventDuration, statusLabel, statusColor } from '../utils/format';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function EventDetailScreen({ route }: any) {
  const id: number = route.params.id;
  const [event, setEvent] = useState<NetworkEvent | null | undefined>(undefined); // undefined = loading, null = deleted
  const [note, setNote] = useState<string | null>(null); // null until loaded, then owned by the input
  const [saving, setSaving] = useState(false);

  // Reload as the monitor updates it (end time, location arriving after GPS fix) — without clobbering the note being typed.
  useFocusEffect(
    useCallback(() => {
      const load = () => {
        getEvent(id)
          .then((e) => {
            setEvent(e);
            setNote((n) => n ?? e?.note ?? '');
          })
          .catch(() => {});
      };
      load();
      return networkMonitor.subscribe(load);
    }, [id])
  );

  const onSave = async () => {
    setSaving(true);
    try {
      await updateEvent(id, { note: note ?? '' });
      Alert.alert('Saved', 'Note updated.');
    } catch (e) {
      Alert.alert('Save failed', String(e));
    } finally {
      setSaving(false);
    }
  };

  if (event === undefined) return null;
  if (event === null) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Card><Text style={{ color: colors.muted, textAlign: 'center' }}>This event was deleted.</Text></Card>
      </View>
    );
  }

  const ended = event.endedAt !== null ? formatTime(event.endedAt) : eventDuration(event, networkMonitor.activeId);

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
          <View style={[styles.dot, { backgroundColor: statusColor(event.status) }]} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{statusLabel(event.status)}</Text>
        </View>
        <Row label="Started" value={formatTime(event.startedAt)} />
        <Row label="Ended" value={ended} />
        <Row label="Duration" value={eventDuration(event, networkMonitor.activeId)} />
        {event.status === 'slow' ? <Row label="Peak latency" value={event.latencyMs !== null ? `${event.latencyMs} ms` : '—'} /> : null}
        <Row label="Connection" value={event.connectionType ?? '—'} />
        <Row label="Latitude" value={event.latitude !== null ? event.latitude.toFixed(5) : '—'} />
        <Row label="Longitude" value={event.longitude !== null ? event.longitude.toFixed(5) : '—'} />
        <Row label="Place" value={event.placeLabel ?? '—'} />
      </Card>

      <Card>
        <Text style={{ fontWeight: '600', marginBottom: spacing.sm, color: colors.text }}>Note</Text>
        <TextInput
          value={note ?? ''}
          onChangeText={setNote}
          multiline
          placeholder="Add a note about this event (e.g. location, what you were doing)…"
          style={styles.input}
        />
        <TouchableOpacity style={styles.btn} onPress={onSave} disabled={saving}>
          <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save note'}</Text>
        </TouchableOpacity>
      </Card>

      <Card>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Tip: long-press an event in the history list to delete it.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  value: { fontSize: 13, color: colors.text, maxWidth: '60%', textAlign: 'right' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10, marginTop: 4 },
  input: { minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, textAlignVertical: 'top', color: colors.text },
  btn: { marginTop: spacing.md, backgroundColor: colors.primary, padding: 12, borderRadius: radii.md, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
});
