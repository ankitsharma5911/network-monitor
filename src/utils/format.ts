import { NetworkEvent } from '../types';

export function formatTime(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString();
}

export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

// endedAt null means either "still happening" or "monitoring stopped / app was killed before it ended".
export function eventDuration(e: NetworkEvent, activeId: number | null): string {
  if (e.endedAt !== null) return formatDuration(e.durationMs);
  return e.id === activeId ? 'Ongoing' : 'Unknown (monitoring was off)';
}

export function statusLabel(s: string): string {
  if (s === 'down') return 'Network down';
  if (s === 'slow') return 'Slow connection';
  return s;
}

export function statusColor(s: string): string {
  if (s === 'down') return '#ef4444';
  if (s === 'slow') return '#f59e0b';
  return '#6b7280';
}
