// Runnable check for the outage / slowdown state machine in src/services/networkMonitor.ts.
// Run: node scripts/check-monitor.js   (no device needed: NetInfo, storage, location and fetch are faked)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

// --- fakes ---------------------------------------------------------------
let now = 1_000_000;
Date.now = () => now;

const ONLINE = { isConnected: true, isInternetReachable: true, type: 'wifi' };
const OFFLINE = { isConnected: false, isInternetReachable: false, type: 'none' };
let netState = ONLINE;
let netListener = null;
const NetInfo = {
  addEventListener(cb) { netListener = cb; cb(netState); return () => { netListener = null; }; },
  fetch: async () => netState,
};
const netChange = (s) => { netState = s; netListener(s); };

// Each probe takes the next queued latency (null = request fails); default is a healthy 100 ms.
let probes = [];
global.fetch = async () => {
  const ms = probes.length ? probes.shift() : 100;
  if (ms === null) throw new Error('network error');
  now += ms;
  return { status: 204 };
};

const settings = { slowThresholdMs: 1500, monitoringEnabled: true, captureLocation: true };
const rows = new Map();
let nextId = 1;
const storage = {
  getSettings: async () => ({ ...settings }),
  saveSettings: async (p) => Object.assign(settings, p),
  insertEvent: async (e) => { const id = nextId++; rows.set(id, { ...e, id }); return id; },
  updateEvent: async (id, p) => { if (rows.has(id)) Object.assign(rows.get(id), p); },
};

const Location = {
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  getLastKnownPositionAsync: async () => ({ coords: { latitude: 28.6, longitude: 77.2 } }),
  getCurrentPositionAsync: async () => { throw new Error('unused'); },
  // geocoding needs internet
  reverseGeocodeAsync: async () => {
    if (netState !== ONLINE) throw new Error('offline');
    return [{ name: 'Home', city: 'Delhi' }];
  },
};

const warnings = [];
console.warn = (...a) => warnings.push(a.join(' '));

// --- load the real monitor with the fakes wired in -----------------------
const stubs = {
  '@react-native-community/netinfo': { __esModule: true, default: NetInfo },
  'expo-location': Location,
  './storage': storage,
  '../../modules/background-monitor': { __esModule: true, default: null }, // null = Expo Go, no native module
};
const realRequire = Module.prototype.require;
Module.prototype.require = function (id) { return id in stubs ? stubs[id] : realRequire.apply(this, arguments); };

const file = path.join(__dirname, '../src/services/networkMonitor.ts');
const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
});
// A fresh monitor instance wired to the given native BackgroundMonitor (or null).
function loadMonitor(native) {
  stubs['../../modules/background-monitor'].default = native;
  const mod = new Module(file);
  mod.filename = file;
  mod._compile(outputText, file);
  return mod.exports.networkMonitor;
}
let monitor = loadMonitor(null);

const settle = async () => { for (let i = 0; i < 20; i++) { await monitor.queue; await new Promise((r) => setImmediate(r)); } };
const all = () => [...rows.values()];
const last = () => all()[all().length - 1];

(async () => {
  // healthy start: nothing logged
  monitor.start();
  await settle();
  assert.strictEqual(rows.size, 0, 'healthy start logs nothing');
  assert.strictEqual(monitor.live.status, 'ok');

  // Wi-Fi drops; NetInfo fires twice in a row -> exactly one outage, tagged with the lost connection
  now = 2_000_000;
  netChange(OFFLINE);
  netChange(OFFLINE);
  await settle();
  assert.strictEqual(rows.size, 1, 'duplicate NetInfo events open one outage');
  assert.deepStrictEqual([last().status, last().startedAt, last().connectionType], ['down', 2_000_000, 'wifi']);
  assert.strictEqual(last().latitude, 28.6, 'location captured');
  assert.strictEqual(last().placeLabel, null, 'geocode fails while offline');
  assert.strictEqual(monitor.activeId, last().id);

  // back online -> outage closed with the right duration, place name resolves now
  now = 2_060_000;
  netChange(ONLINE);
  await settle();
  assert.deepStrictEqual([last().endedAt, last().durationMs], [2_060_000, 60_000]);
  assert.strictEqual(last().placeLabel, 'Home, Delhi', 'place resolved once back online');
  assert.strictEqual(monitor.activeId, null);

  // one slow request followed by a fast one is a blip, not an event
  probes = [3000, 100];
  await monitor.refresh();
  assert.strictEqual(rows.size, 1, 'single slow probe is ignored');

  // sustained slowness -> slow event, peak latency tracked, closes on recovery
  probes = [2000, 2500];
  await monitor.refresh();
  assert.deepStrictEqual([rows.size, last().status, last().latencyMs], [2, 'slow', 2500]);
  probes = [4000];
  await monitor.refresh();
  probes = [3000];
  await monitor.refresh();
  assert.strictEqual(last().latencyMs, 4000, 'keeps worst latency, not the latest');
  const slowStart = last().startedAt;
  probes = [100, 100];
  await monitor.refresh();
  assert.ok(last().endedAt !== null && last().durationMs === last().endedAt - slowStart, 'slow event closed');
  assert.strictEqual(last().latencyMs, 4000, 'closing does not overwrite peak latency');

  // ISP down while Wi-Fi stays associated (NetInfo still says reachable) -> probe failures = outage
  probes = [null, null];
  await monitor.refresh();
  assert.deepStrictEqual([rows.size, last().status, last().connectionType], [3, 'down', 'wifi']);

  // stopping mid-outage leaves the end unknown instead of inventing one
  monitor.stop();
  await settle();
  assert.deepStrictEqual([last().endedAt, monitor.activeId], [null, null]);

  // while stopped, refresh updates the live status but logs nothing
  probes = [null, null];
  await monitor.refresh();
  assert.deepStrictEqual([rows.size, monitor.live.status], [3, 'down']);

  // --- APK path: the native foreground service drives ticks and probes -----------------------
  const calls = [];
  let tick = null;
  const native = {
    start: (ms) => calls.push(['start', ms]),
    stop: () => calls.push(['stop']),
    probe: async () => {
      const ms = probes.length ? probes.shift() : 100;
      if (ms !== null) now += ms;
      return ms;
    },
    addListener: (event, cb) => { tick = cb; return { remove: () => { tick = null; } }; },
  };
  global.fetch = () => { throw new Error('fetch used although the native probe exists'); };
  netState = ONLINE;
  monitor = loadMonitor(native);
  monitor.start();
  await settle();
  assert.deepStrictEqual(calls, [['start', 30000]], 'foreground service started with the sample interval');
  const before = rows.size;
  probes = [null, null];
  tick(); // what the service does every 30 s, also in the background
  await settle();
  assert.deepStrictEqual([rows.size, last().status], [before + 1, 'down'], 'native tick + native probe log an outage');
  monitor.stop();
  await settle();
  assert.deepStrictEqual([calls[calls.length - 1], tick], [['stop'], null], 'stop ends the service and the tick listener');

  assert.deepStrictEqual(warnings, [], 'no check threw');

  // Android refuses to start the service (e.g. started from the background) -> JS interval instead
  monitor = loadMonitor({ ...native, start: () => { throw new Error('ForegroundServiceStartNotAllowedException'); } });
  monitor.start();
  await settle();
  assert.ok(warnings.some((w) => w.includes('background service unavailable')), 'falls back with a warning');
  assert.strictEqual(tick, null, 'no dangling tick listener after the failed start');
  monitor.stop();

  console.log('check-monitor: all assertions passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
