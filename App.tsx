import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import RootNavigator from './src/navigation';
import { networkMonitor } from './src/services/networkMonitor';
import { getSettings } from './src/services/storage';

export default function App() {
  useEffect(() => {
    (async () => {
      const s = await getSettings();
      // Ask once, while we're in the foreground; the monitor itself only checks.
      if (s.captureLocation && (await Location.getForegroundPermissionsAsync()).status === 'undetermined') {
        await Location.requestForegroundPermissionsAsync();
      }
      if (s.monitoringEnabled) networkMonitor.start();
    })().catch((e) => console.warn('[app] startup failed', e));
  }, []);

  return (
    <>
      <RootNavigator />
      <StatusBar style="dark" />
    </>
  );
}
