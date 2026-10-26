import { requireOptionalNativeModule } from 'expo';

type BackgroundMonitorModule = {
  start(intervalMs: number, title: string, text: string): void;
  stop(): void;
  probe(url: string, timeoutMs: number): Promise<number | null>;
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): void;
  addListener(event: 'onTick', listener: () => void): { remove(): void };
};

// null in Expo Go (no custom native code) and on iOS; callers fall back to JS timers + fetch there.
export default requireOptionalNativeModule<BackgroundMonitorModule>('BackgroundMonitor');
