import Constants from 'expo-constants';

const LATEST_RELEASE_URL = 'https://api.github.com/repos/ankitsharma5911/network-monitor/releases/latest';

export type AppUpdate = { version: string; apkUrl: string };

// "1.10.0" > "1.9.2": compares numerically, part by part.
export function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

// The latest GitHub Release if it's newer than this app and has an APK attached, otherwise null.
export async function findUpdate(): Promise<AppUpdate | null> {
  const current = Constants.expoConfig?.version;
  if (!current) return null;
  const res = await fetch(LATEST_RELEASE_URL, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return null; // offline, rate-limited (60 checks/hour per IP), or no release yet
  const release = await res.json();
  const version = String(release.tag_name ?? '').replace(/^v/, '');
  const apk = (release.assets ?? []).find((a: { name?: string }) => a.name?.endsWith('.apk'));
  if (!apk || !isNewer(version, current)) return null;
  return { version, apkUrl: apk.browser_download_url };
}
