// English step 6 (owner request, Nov 2026): notices the admin writes by hand can also carry an English title and
// details (037_notice_en_admin.sql). Written first (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reset } from './stubs/supabase.mjs';
import { setLang } from '../../src/lib/lang.js';
import { withEnglish, listNotifications, sendNotification } from '../../src/lib/notifications.js';
import { notifySegment } from '../../src/lib/admin.js';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const calls = () => globalThis.__sbCalls.filter((c) => c[0] === 'rpc');
const last = (name) => calls().filter((c) => c[1] === name).pop();
beforeEach(async () => { reset(); await setLang('bn'); });

test('a general notice gets English only when the server gives it (the admin wrote English)', () => {
  const rows = [{ id: 'b1', source: 'all', title: 'ঈদ মোবারক', body: 'শুভেচ্ছা' }, { id: 'b2', source: 'all', title: 'শুধু বাংলা', body: null }];
  const out = withEnglish(rows, [{ id: 'b1', title: 'Eid Mubarak', body: 'Greetings' }]);
  assert.deepEqual(out.map((r) => [r.title, r.body]), [['Eid Mubarak', 'Greetings'], ['শুধু বাংলা', null]]);
});

test('in English, the notification box asks for the English of every notice, general ones too', async () => {
  const list = [{ id: 'a', source: 'me', kind: 'admin', title: 'আপনার ভিসা হয়েছে', body: null, is_read: false },
    { id: 'b', source: 'all', kind: 'admin', title: 'ঈদ মোবারক', body: null, is_read: false }];
  await setLang('en');
  globalThis.__sb.rpc = (name) => (name === 'my_notifications' ? { data: list, error: null }
    : { data: [{ id: 'a', title: 'Your visa is ready', body: null }, { id: 'b', title: 'Eid Mubarak', body: null }], error: null });
  const r = await listNotifications();
  assert.deepEqual(r.rows.map((x) => x.title), ['Your visa is ready', 'Eid Mubarak']);
  assert.deepEqual(last('my_notices_en')[2], { p_ids: ['a', 'b'] });
});

test('sending: the English title and details go to the server when written', async () => {
  globalThis.__sb.rpc = () => ({ data: 'ok', error: null });
  await sendNotification('all', 'ঈদ মোবারক', 'শুভেচ্ছা', null, false, ' Eid Mubarak ', ' Greetings ');
  const a = last('admin_send_notification')[2];
  assert.equal(a.p_title_en, 'Eid Mubarak');
  assert.equal(a.p_body_en, 'Greetings');
});

test('sending without English sends exactly the old values (works even before step 037 is run)', async () => {
  globalThis.__sb.rpc = () => ({ data: 'ok', error: null });
  await sendNotification('all', 'শুধু বাংলা', '', null, false, '  ', '');
  const a = last('admin_send_notification')[2];
  assert.deepEqual(Object.keys(a).sort(), ['p_audience', 'p_body', 'p_important', 'p_target', 'p_title']);
});

test('a notice to a group / month / district can carry English too', async () => {
  globalThis.__sb.rpc = () => ({ data: 'ok:3', error: null });
  assert.equal(await notifySegment('group', 'g1', 'কাল সকালে বাস', 'সকাল ৮টায়', 'Bus tomorrow', 'At 8am'), 3);
  const a = last('admin_notify_segment')[2];
  assert.equal(a.p_title_en, 'Bus tomorrow');
  assert.equal(a.p_body_en, 'At 8am');
  await notifySegment('group', 'g1', 'শুধু বাংলা', null);
  assert.deepEqual(Object.keys(last('admin_notify_segment')[2]).sort(), ['p_body', 'p_kind', 'p_title', 'p_value']);
});

test('the admin screens have the optional English boxes, and the preview shows them', () => {
  const n = read('src/screens/AdminNotify.tsx');
  assert.ok(n.includes('titleEn') && n.includes('bodyEn'), 'AdminNotify keeps the English title and details');
  assert.ok(/sendNotification\([^;]*titleEn[^;]*bodyEn/.test(n), 'and sends them');
  assert.ok(n.includes("tr('ইংরেজি শিরোনাম (ইচ্ছা করলে)'"), 'labelled in Bengali as optional');
  const p = read('src/screens/AdminPart4.tsx');
  assert.ok(/notifySegment\([^;]*titleEn[^;]*bodyEn/.test(p), 'the segment form sends them too');
  const box = p.slice(p.indexOf('export function SegmentNotifyBox'), p.indexOf('// ---------- 5) SOS record'));
  assert.ok(box.includes('noEnYet()'), 'before step 037: a plain message, inside the segment form');
  assert.equal(p.split('titleEn').length - 1, box.split('titleEn').length - 1, 'titleEn is used only inside the segment form');
});
