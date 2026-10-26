import { useEffect } from 'react';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import RootNavigator from './src/navigation';
import { networkMonitor } from './src/services/networkMonitor';
import { getSettings } from './src/services/storage';
import { findUpdate } from './src/services/updateCheck';

export default function App() {
  useEffect(() => {
    (async () => {
      const s = await getSettings();
      // Ask once, while we're in the foreground; the monitor itself only checks.
      if (s.captureLocation && (await Location.getForegroundPermissionsAsync()).status === 'undetermined') {
        await Location.requestForegroundPermissionsAsync();
      }
      // Android 13+: without this the background-monitoring notification is hidden (logging still works).
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      if (s.monitoringEnabled) networkMonitor.start();
    })()
      .catch((e) => console.warn('[app] startup failed', e))
      // After the permission prompts, so dialogs don't stack.
      .then(findUpdate)
      .then((update) => {
        if (!update) return;
        Alert.alert('Update available', `Version ${update.version} is ready to install. Your recorded history is kept.`, [
          { text: 'Later', style: 'cancel' },
          // Opens the browser, which downloads the APK; tapping it installs over this version.
          { text: 'Download', onPress: () => Linking.openURL(update.apkUrl) },
        ]);
      })
      .catch(() => {}); // offline or GitHub unreachable: check again next launch
  }, []);

  return (
    <>
      <RootNavigator />
      <StatusBar style="dark" />
    </>
  );
}
