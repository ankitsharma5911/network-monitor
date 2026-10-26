import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { EventStatus, LiveStatus } from '../types';
import { insertEvent, updateEvent, getSettings, saveSettings } from './storage';

const PROBE_URL = 'https://www.google.com/generate_204';
const SAMPLE_INTERVAL_MS = 30_000;

type Status = LiveStatus['status'];

type Active = {
  id: number;
  status: EventStatus;
  startedAt: number;
  peakLatencyMs: number | null;
  coords: { latitude: number; longitude: number } | null;
  labelled: boolean;
};

// Round-trip time of one request to a 204 endpoint, or null if it failed, timed out,
// or got anything but 204 (captive portal / login page).
async function probe(timeoutMs: number): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(PROBE_URL, { cache: 'no-store', signal: ctrl.signal });
    return res.status === 204 ? Date.now() - start : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

class NetworkMonitor {
  live: LiveStatus | null = null;
  private running = false;
  private active: Active | null = null; // the currently-open down/slow event
  private lastType: string | null = null;
  private unsubscribeNetInfo: (() => void) | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  // Checks run one at a time in arrival order, so two can never both open an event.
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  get activeId() {
    return this.active?.id ?? null;
  }

  isRunning() {
    return this.running;
  }

  async setEnabled(on: boolean) {
    await saveSettings({ monitoringEnabled: on });
    if (on) this.start();
    else this.stop();
  }

  start() {
    if (this.running) return;
    this.running = true;
    // NetInfo calls the listener right away with the current state, which doubles as the first check.
    this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      this.enqueue(state);
    });
    // Periodic probe catches slowdowns, which NetInfo never reports.
    this.interval = setInterval(() => {
      this.enqueue();
    }, SAMPLE_INTERVAL_MS);
    this.emit();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.unsubscribeNetInfo?.();
    this.unsubscribeNetInfo = null;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    // An open event keeps endedAt = null: we stopped watching, the outage didn't end.
    // Queued so it lands after any check already in flight.
    this.queue = this.queue.then(() => {
      this.active = null;
      this.emit();
    });
    this.emit();
  }

  // One-off check (pull-to-refresh). Only logs events while monitoring is running.
  refresh() {
    return this.enqueue();
  }

  private enqueue(state?: NetInfoState) {
    const at = Date.now(); // when the change happened, even if the check waits behind a slow probe
    this.queue = this.queue
      .then(() => this.check(state ?? null, at))
      .catch((e) => console.warn('[networkMonitor] check failed', e));
    return this.queue;
  }

  private async check(state: NetInfoState | null, at: number) {
    state ??= await NetInfo.fetch();
    const { slowThresholdMs } = await getSettings();
    const timeoutMs = Math.max(10_000, slowThresholdMs * 2);
    const classify = (ms: number | null): Status => (ms === null ? 'down' : ms > slowThresholdMs ? 'slow' : 'ok');
    // null = "unknown", not "disconnected": let the probe decide.
    const linkUp = state.isConnected !== false && state.isInternetReachable !== false;
    const current: Status = this.active?.status ?? 'ok';

    let latencyMs = linkUp ? await probe(timeoutMs) : null;
    let status: Status = linkUp ? classify(latencyMs) : 'down';
    // ponytail: one confirming re-probe filters single-request blips; n-of-m voting if events are still noisy
    if (linkUp && status !== current) {
      latencyMs = await probe(timeoutMs);
      status = classify(latencyMs);
    }

    // For an outage, record the connection that was lost rather than "none".
    const type = state.type === 'none' && this.lastType ? this.lastType : state.type;
    if (state.type !== 'none') this.lastType = state.type;
    this.live = { status, type: state.type, latencyMs, checkedAt: Date.now() };

    if (this.running) {
      if (status !== current) {
        await this.closeActive(at);
        if (status !== 'ok') await this.openEvent(status, at, type, latencyMs);
      } else if (this.active && latencyMs !== null && latencyMs > (this.active.peakLatencyMs ?? 0)) {
        // still slow: keep the worst latency seen
        this.active.peakLatencyMs = latencyMs;
        await updateEvent(this.active.id, { latencyMs });
      }
    }
    this.emit();
  }

  private async closeActive(at: number) {
    const ev = this.active;
    if (!ev) return;
    this.active = null;
    await updateEvent(ev.id, { endedAt: at, durationMs: Math.max(0, at - ev.startedAt) });
    // Geocoding needs internet, so an outage's place name can usually only resolve now.
    if (ev.status === 'down') this.labelPlace(ev).catch(() => {});
  }

  private async openEvent(status: EventStatus, at: number, type: string, latencyMs: number | null) {
    const id = await insertEvent({
      status,
      startedAt: at,
      endedAt: null,
      durationMs: null,
      latencyMs,
      connectionType: type,
      latitude: null,
      longitude: null,
      placeLabel: null,
      note: null,
    });
    const ev: Active = { id, status, startedAt: at, peakLatencyMs: latencyMs, coords: null, labelled: false };
    this.active = ev;
    // Not awaited: a GPS fix can take a long time and must never delay logging.
    this.locate(ev).catch(() => {});
  }

  private async locate(ev: Active) {
    if (!(await getSettings()).captureLocation) return;
    // Only check here; asking needs the app in the foreground (App.tsx / Settings do that).
    if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return;
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    ev.coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    await updateEvent(ev.id, ev.coords);
    await this.labelPlace(ev);
  }

  private async labelPlace(ev: Active) {
    if (!ev.coords || ev.labelled) return;
    const [g] = await Location.reverseGeocodeAsync(ev.coords);
    if (!g) return;
    ev.labelled = true;
    await updateEvent(ev.id, { placeLabel: [g.name, g.street, g.city, g.region].filter(Boolean).join(', ') });
  }
}

export const networkMonitor = new NetworkMonitor();
export default networkMonitor;
