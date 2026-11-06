// English step 5 (owner request, Nov 2026): the server learns each person's language (for phone alerts), and the
// notification box shows the server's notices in English (036_lang.sql). Written first (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reset } from './stubs/supabase.mjs';
import { setLang } from '../../src/lib/lang.js';
import { syncLang, resetLangSync } from '../../src/lib/langSync.js';
import { withEnglish, listNotifications } from '../../src/lib/notifications.js';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const calls = () => globalThis.__sbCalls.filter((c) => c[0] === 'rpc');
beforeEach(async () => { reset(); resetLangSync(); await setLang('bn'); });

test('the chosen language is sent to the server once, and again when it changes', async () => {
  globalThis.__sb.rpc = () => ({ data: 'ok', error: null });
  await syncLang(); await syncLang();
  await setLang('en'); await syncLang();
  assert.deepEqual(calls().map((c) => [c[1], c[2].p_lang]), [['set_my_lang', 'bn'], ['set_my_lang', 'en']]);
});

test('if the server step is not run yet (or no internet), nothing breaks and it tries again later', async () => {
  globalThis.__sb.rpc = () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.set_my_lang' } });
  await syncLang();
  globalThis.__sb.rpc = () => ({ data: 'ok', error: null });
  await syncLang();
  assert.equal(calls().length, 2, 'tried again because the first one did not work');
});

test('notices: my own get their English, general ones and unknown ones stay as written', () => {
  const rows = [{ id: 'a', source: 'me', title: 'নতুন চুক্তির অনুরোধ এসেছে', body: 'x' }, { id: 'b', source: 'all', title: 'ঈদ মোবারক', body: null }];
  const out = withEnglish(rows, [{ id: 'a', title: 'New contract request', body: 'English body' }, { id: 'b', title: 'NO', body: 'NO' }]);
  assert.deepEqual(out.map((r) => [r.title, r.body]), [['New contract request', 'English body'], ['ঈদ মোবারক', null]]);
  assert.equal(rows[0].title, 'নতুন চুক্তির অনুরোধ এসেছে', 'the original list is not changed');
});

test('the notification box asks for English only when English is chosen, and works without it', async () => {
  const list = [{ id: 'a', source: 'me', kind: 'contract', title: 'নতুন চুক্তির অনুরোধ এসেছে', body: null, is_read: false }];
  globalThis.__sb.rpc = (name) => (name === 'my_notifications' ? { data: list, error: null } : { data: [{ id: 'a', title: 'New contract request', body: null }], error: null });
  let r = await listNotifications();
  assert.equal(r.rows[0].title, 'নতুন চুক্তির অনুরোধ এসেছে');
  assert.ok(!calls().some((c) => c[1] === 'my_notices_en'), 'Bengali: no extra call');
  await setLang('en'); reset();
  globalThis.__sb.rpc = (name) => (name === 'my_notifications' ? { data: list, error: null } : { data: [{ id: 'a', title: 'New contract request', body: null }], error: null });
  r = await listNotifications();
  assert.equal(r.rows[0].title, 'New contract request');
  assert.deepEqual(calls().find((c) => c[1] === 'my_notices_en')[2], { p_ids: ['a'] });
  reset();
  globalThis.__sb.rpc = (name) => (name === 'my_notifications' ? { data: list, error: null } : { data: null, error: { code: 'PGRST202', message: 'not found' } });
  r = await listNotifications();
  assert.equal(r.rows[0].title, 'নতুন চুক্তির অনুরোধ এসেছে', 'server step not run yet: Bengali, no error');
});

test('the app starts the language sync after login', () => {
  assert.ok(read('App.tsx').includes('startLangSync('));
});
