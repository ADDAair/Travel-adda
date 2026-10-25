// Admin part 1 (022) on the app side — written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reset } from './stubs/supabase.mjs';
import { findContracts, contractDetail, addContractNote, userDetail, adminCounts, listRatings, hideRating, setLeaderListed, setVideo, adminGroups, countBadge } from '../../src/lib/admin.js';
import { APP_VERSION, versionLess, needsUpdate } from '../../src/lib/appVersion.js';
import { mergeVideos, videoFor, VIDEO_TOPICS } from '../../src/content/videos.js';

beforeEach(() => { reset(); globalThis.__sb = { rpc: (n) => ({ data: n === 'admin_counts' ? { payments: 3 } : 'ok', error: null }) }; });
const last = () => globalThis.__sbCalls.at(-1);

test('admin calls send exactly what the server expects', async () => {
  await findContracts(' TC-000012 '); assert.deepEqual(last(), ['rpc', 'admin_find_contracts', { p_query: 'TC-000012' }]);
  await contractDetail('c1'); assert.deepEqual(last(), ['rpc', 'admin_contract_detail', { p_id: 'c1' }]);
  await addContractNote('c1', '  কথা হয়েছে দুই পক্ষের সাথে  '); assert.deepEqual(last(), ['rpc', 'admin_add_contract_note', { p_id: 'c1', p_note: 'কথা হয়েছে দুই পক্ষের সাথে' }]);
  await userDetail('u1'); assert.deepEqual(last(), ['rpc', 'admin_user_detail', { p_user: 'u1' }]);
  await hideRating('c1', true, 'গালি দেওয়া'); assert.deepEqual(last(), ['rpc', 'admin_hide_rating', { p_contract: 'c1', p_hide: true, p_reason: 'গালি দেওয়া' }]);
  await setLeaderListed('u2', false, 'পরীক্ষার লিডার'); assert.deepEqual(last(), ['rpc', 'admin_set_leader_listed', { p_user: 'u2', p_listed: false, p_reason: 'পরীক্ষার লিডার' }]);
  await setVideo('Umrah', ''); assert.deepEqual(last(), ['rpc', 'admin_set_video', { p_route: 'Umrah', p_url: null }]);
  await listRatings(''); assert.deepEqual(last(), ['rpc', 'admin_list_ratings', { p_query: null }]);
  await adminGroups('TL-00004'); assert.deepEqual(last(), ['rpc', 'admin_groups', { p_query: 'TL-00004' }]);
  assert.deepEqual(await adminCounts(), { payments: 3 });
});

test('short notes and reasons are stopped before sending', async () => {
  await assert.rejects(addContractNote('c1', 'ক'), (e) => e.code === 'short');
  await assert.rejects(hideRating('c1', true, ''), (e) => e.code === 'short');
  await assert.rejects(setLeaderListed('u', false, 'না'), (e) => e.code === 'short');
});

test('section button shows how many things wait, in Bengali digits', () => {
  assert.equal(countBadge('টাকা ও কমিশন', 3), 'টাকা ও কমিশন (৩)');
  assert.equal(countBadge('টাকা ও কমিশন', 0), 'টাকা ও কমিশন');
  assert.equal(countBadge('প্যাকেজ', undefined), 'প্যাকেজ');
});

test('app version matches app.json, and the update check compares numbers correctly', () => {
  const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
  assert.equal(APP_VERSION, app.expo.version);
  assert.equal(versionLess('0.1.0', '0.2.0'), true);
  assert.equal(versionLess('0.10.0', '0.9.9'), false);
  assert.equal(versionLess('1.0.0', '1.0.0'), false);
  assert.equal(needsUpdate(null), false);
  assert.equal(needsUpdate('garbage'), false);
  assert.equal(needsUpdate('99.0.0'), true);
});

test('video links from the admin replace "শীঘ্রই আসছে" (https only)', () => {
  const t = mergeVideos(VIDEO_TOPICS, [{ route: 'Umrah', url: 'https://v.example/u.mp4' }, { route: 'Hajj', url: 'http://bad/x' }, { route: 'Nope', url: 'https://v/x' }]);
  assert.equal(videoFor('Umrah', t).ready, true);
  assert.equal(videoFor('Hajj', t).ready, false);
  assert.equal(t.Nope, undefined);
  assert.equal(VIDEO_TOPICS.Umrah.url, null, 'the built-in list is not changed');
});

test('forced update: blocks old apps; the owner can still go in to fix a wrong setting', async () => {
  const { updateGate } = await import('../../src/lib/appVersion.js');
  const rows = [{ key: 'min_app_version', value: '99.0.0' }, { key: 'store_url', value: 'https://play.google.com/x' }];
  assert.deepEqual(updateGate(rows, 'haji'), { block: true, storeUrl: 'https://play.google.com/x', canSkip: false });
  assert.equal(updateGate(rows, 'admin').canSkip, true);
  assert.equal(updateGate([{ key: 'min_app_version', value: '0.0.1' }], 'haji').block, false);
  assert.equal(updateGate([], 'haji').block, false);
  assert.equal(updateGate([{ key: 'min_app_version', value: '99.0.0' }, { key: 'store_url', value: 'http://evil/x.apk' }], 'haji').storeUrl, null);
});

test('video links load from the server, are kept on the phone, and work offline next time', async () => {
  const { loadVideoLinks, currentVideoTopics } = await import('../../src/lib/videoLinks.js');
  globalThis.__store.clear();
  globalThis.__sb = { from: () => ({ data: [{ route: 'Umrah', url: 'https://v.example/u.mp4' }], error: null }) };
  await loadVideoLinks();
  assert.equal(currentVideoTopics().Umrah.url, 'https://v.example/u.mp4');
  globalThis.__sb = { from: () => ({ data: null, error: { message: 'Failed to fetch' } }) };
  await loadVideoLinks();
  assert.equal(currentVideoTopics().Umrah.url, 'https://v.example/u.mp4', 'kept when offline');
});
