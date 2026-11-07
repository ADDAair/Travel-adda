// Points a CI checkout at the TEST server (ami-haji-test, Mumbai) instead of the real one — used by the nightly
// two-phone test (groups-e2e). Only changes the checkout inside the CI job; the app in the repo keeps the real server.
// Both values are public by design (a project address and a publishable key); no secret is here.
import { readFileSync, writeFileSync } from 'node:fs';

export const REAL_URL = 'https://lmwsfnzpgujozkxkmkwu.supabase.co';
export const TEST_SERVER = {
  url: 'https://yhavfnaljbiefzofcduj.supabase.co',
  key: 'sb_publishable_XDUt8eT2RXVYZbgUhVZF-A_qC9tnXE5',
};

export function pointConfig(src, server) {
  const urlRe = /(SUPABASE_URL\s*=\s*')[^']+(')/, keyRe = /(SUPABASE_ANON_KEY\s*=\s*')[^']+(')/;
  if (!urlRe.test(src) || !keyRe.test(src)) throw new Error('src/config.ts does not look as expected');
  const out = src.replace(urlRe, `$1${server.url}$2`).replace(keyRe, `$1${server.key}$2`);
  if (out.includes(REAL_URL.replace('https://', '').split('.')[0])) throw new Error('the real server is still in the config');
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('use_test_server.mjs')) {
  const f = 'src/config.ts';
  writeFileSync(f, pointConfig(readFileSync(f, 'utf8'), TEST_SERVER));
  console.log(`CI now uses the test server ${TEST_SERVER.url}`);
}
