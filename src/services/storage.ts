import * as SQLite from 'expo-sqlite';
import { NetworkEvent, AppSettings, EventStatus } from '../types';

const DB_NAME = 'network-monitor.db';
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Every query goes through here, so the schema always exists before first use.
function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME)
      .then(async (db) => {
        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS network_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            duration_ms INTEGER,
            latency_ms INTEGER,
            connection_type TEXT,
            latitude REAL,
            longitude REAL,
            place_label TEXT,
            note TEXT,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_ne_started ON network_events(started_at);
          CREATE INDEX IF NOT EXISTS idx_ne_status ON network_events(status);
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );
        `);
        return db;
      })
      .catch((e) => {
        dbPromise = null; // let the next call retry instead of caching the failure forever
        throw e;
      });
  }
  return dbPromise;
}

const DEFAULT_SETTINGS: AppSettings = {
  slowThresholdMs: 1500,
  monitoringEnabled: true,
  captureLocation: true,
};

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map: Record<string, string> = {};
  rows.forEach((r) => (map[r.key] = r.value));
  const threshold = Number(map.slowThresholdMs);
  return {
    slowThresholdMs: threshold >= 100 ? threshold : DEFAULT_SETTINGS.slowThresholdMs,
    monitoringEnabled: (map.monitoringEnabled ?? String(DEFAULT_SETTINGS.monitoringEnabled)) === 'true',
    captureLocation: (map.captureLocation ?? String(DEFAULT_SETTINGS.captureLocation)) === 'true',
  };
}

export async function saveSettings(patch: Partial<AppSettings>) {
  const db = await getDb();
  for (const [key, value] of Object.entries(patch)) {
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, String(value));
  }
}

export async function insertEvent(
  e: Omit<NetworkEvent, 'id' | 'createdAt'>
): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    `INSERT INTO network_events (
      status, started_at, ended_at, duration_ms, latency_ms,
      connection_type, latitude, longitude, place_label, note, created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    e.status,
    e.startedAt,
    e.endedAt,
    e.durationMs,
    e.latencyMs,
    e.connectionType,
    e.latitude,
    e.longitude,
    e.placeLabel,
    e.note,
    Date.now()
  );
  return res.lastInsertRowId;
}

export async function updateEvent(id: number, patch: Partial<NetworkEvent>) {
  const db = await getDb();
  const cols: string[] = [];
  const vals: any[] = [];
  const push = (k: string, v: any) => {
    cols.push(k);
    vals.push(v);
  };
  if (patch.endedAt !== undefined) push('ended_at', patch.endedAt);
  if (patch.durationMs !== undefined) push('duration_ms', patch.durationMs);
  if (patch.latencyMs !== undefined) push('latency_ms', patch.latencyMs);
  if (patch.latitude !== undefined) push('latitude', patch.latitude);
  if (patch.longitude !== undefined) push('longitude', patch.longitude);
  if (patch.placeLabel !== undefined) push('place_label', patch.placeLabel);
  if (patch.note !== undefined) push('note', patch.note);
  if (cols.length === 0) return;
  await db.runAsync(`UPDATE network_events SET ${cols.map((c) => c + ' = ?').join(', ')} WHERE id = ?`, ...vals, id);
}

export async function deleteEvent(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM network_events WHERE id = ?', id);
}

export async function clearAll() {
  const db = await getDb();
  await db.runAsync('DELETE FROM network_events');
}

const toEvent = (r: any): NetworkEvent => ({
  id: r.id,
  status: r.status,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  durationMs: r.duration_ms,
  latencyMs: r.latency_ms,
  connectionType: r.connection_type,
  latitude: r.latitude,
  longitude: r.longitude,
  placeLabel: r.place_label,
  note: r.note,
  createdAt: r.created_at,
});

export async function getEvent(id: number): Promise<NetworkEvent | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<any>('SELECT * FROM network_events WHERE id = ?', id);
  return r ? toEvent(r) : null;
}

// limit -1 = no limit (SQLite semantics)
export async function listEvents(status?: EventStatus, limit = 1000): Promise<NetworkEvent[]> {
  const db = await getDb();
  const rows = status
    ? await db.getAllAsync<any>('SELECT * FROM network_events WHERE status = ? ORDER BY started_at DESC LIMIT ?', status, limit)
    : await db.getAllAsync<any>('SELECT * FROM network_events ORDER BY started_at DESC LIMIT ?', limit);
  return rows.map(toEvent);
}

export async function getStats() {
  const db = await getDb();
  const total = (await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM network_events'))?.c ?? 0;
  const downs = (await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM network_events WHERE status='down'"))?.c ?? 0;
  const slows = (await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM network_events WHERE status='slow'"))?.c ?? 0;
  const totalDowntime = (await db.getFirstAsync<{ s: number }>("SELECT COALESCE(SUM(duration_ms),0) as s FROM network_events WHERE status='down'"))?.s ?? 0;
  const lastDown = await db.getFirstAsync<{ started_at: number }>("SELECT started_at FROM network_events WHERE status='down' ORDER BY started_at DESC LIMIT 1");
  const avgLatency = (await db.getFirstAsync<{ a: number | null }>("SELECT AVG(latency_ms) as a FROM network_events WHERE status='slow' AND latency_ms IS NOT NULL"))?.a ?? 0;
  return { total, downs, slows, totalDowntimeMs: totalDowntime, lastDownAt: lastDown?.started_at ?? null, avgSlowLatencyMs: Math.round(avgLatency) };
}

export type Stats = Awaited<ReturnType<typeof getStats>>;
