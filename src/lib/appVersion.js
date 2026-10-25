// This app's version (keep equal to "version" in app.json — a unit test checks it) and the forced-update check.
export const APP_VERSION = '0.1.0';
const parse = (v) => (/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(v || '').trim()) ? String(v).trim().split('.').map(Number) : null);
export function versionLess(a, b) {
  const x = parse(a); const y = parse(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i += 1) { if (x[i] !== y[i]) return x[i] < y[i]; }
  return false;
}
// true when the admin has set a minimum version newer than this app
export const needsUpdate = (minVersion) => !!parse(minVersion) && versionLess(APP_VERSION, minVersion);

// From app_settings rows: should this app stop and ask for the new version? The owner may skip (to fix a wrong setting).
export function updateGate(rows, role) {
  const h = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  const url = typeof h.store_url === 'string' && /^https:\/\/\S+$/.test(h.store_url) ? h.store_url : null;
  return { block: needsUpdate(h.min_app_version), storeUrl: url, canSkip: role === 'admin' };
}
