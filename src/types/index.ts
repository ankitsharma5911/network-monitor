export type EventStatus = 'down' | 'slow';

export type NetworkEvent = {
  id: number;
  status: EventStatus;
  startedAt: number; // epoch ms
  endedAt: number | null; // null = still ongoing, or the app was killed before it ended
  durationMs: number | null;
  latencyMs: number | null; // worst latency seen during a slow event
  connectionType: string | null;
  latitude: number | null;
  longitude: number | null;
  placeLabel: string | null;
  note: string | null;
  createdAt: number;
};

export type LiveStatus = {
  status: 'ok' | EventStatus;
  type: string;
  latencyMs: number | null;
  checkedAt: number;
};

export type AppSettings = {
  slowThresholdMs: number;
  monitoringEnabled: boolean;
  captureLocation: boolean;
};
