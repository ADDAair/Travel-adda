// Admin part 3 (supabase/024_admin_part3.sql): chat reading only with the haji's consent, and guide/dua text
// corrections from the admin panel — written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reset } from './stubs/supabase.mjs';
import { requestChatConsent, requestResultText, consentStatusText, respondConsent, revokeConsent, viewHelpChat, myChatConsents }
  from '../../src/lib/chatConsent.js';
import { textFields, applyOverrides, setContent } from '../../src/lib/contentEdit.js';
import { VIDEO_TOPICS } from '../../src/content/videos.js';

beforeEach(() => reset());
const calls = () => globalThis.__sbCalls;

// ---------- chat consent ----------
test('asking for consent needs a reason, then calls the server', async () => {
  await assert.rejects(requestChatConsent('c1', ' ক '), (e) => e.code === 'reason');
  assert.equal(calls().length, 0);
  globalThis.__sb = { rpc: () => ({ data: 'sent', error: null }) };
  assert.equal(await requestChatConsent('c1', ' হোটেল নিয়ে অভিযোগ '), 'sent');
  assert.deepEqual(calls().at(-1), ['rpc', 'admin_request_chat_consent', { p_contract: 'c1', p_reason: 'হোটেল নিয়ে অভিযোগ' }]);
});

test('results and states are plain Bengali; reading is possible only while active', () => {
  assert.ok(requestResultText('sent').includes('হাজীর কাছে'));
  assert.ok(requestResultText('exists').includes('আগেই'));
  assert.ok(consentStatusText({ status: 'asked' }).includes('অপেক্ষায়'));
  assert.ok(consentStatusText({ status: 'granted', active: true }).includes('অনুমতি দিয়েছেন'));
  assert.ok(consentStatusText({ status: 'granted', active: false }).includes('মেয়াদ শেষ'));
  assert.ok(consentStatusText({ status: 'declined' }).includes('রাজি হননি'));
  assert.ok(consentStatusText({ status: 'revoked' }).includes('ফিরিয়ে'));
});

test('the haji answers and can take the permission back', async () => {
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  await respondConsent('k1', true);
  assert.deepEqual(calls().at(-1), ['rpc', 'chat_consent_respond', { p_id: 'k1', p_accept: true }]);
  await revokeConsent('k1');
  assert.deepEqual(calls().at(-1), ['rpc', 'chat_consent_revoke', { p_id: 'k1' }]);
  globalThis.__sb = { rpc: () => ({ data: 'not_found', error: null }) };
  await assert.rejects(respondConsent('k1', false), (e) => e.code === 'not_found');
});

test('my requests: empty list before step 024 instead of an error', async () => {
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.my_chat_consents' } }) };
  assert.deepEqual(await myChatConsents(), []);
  globalThis.__sb = { rpc: () => ({ data: [{ id: 'k1' }], error: null }) };
  assert.equal((await myChatConsents()).length, 1);
});

test('reading the chat goes through the logged server function only', async () => {
  globalThis.__sb = { rpc: () => ({ data: [{ body: 'হোটেল কোথায়?' }], error: null }) };
  const rows = await viewHelpChat('k1');
  assert.equal(rows.length, 1);
  assert.deepEqual(calls().at(-1), ['rpc', 'admin_view_help_chat', { p_consent: 'k1' }]);
  assert.equal(calls().some((c) => c[0] === 'from'), false, 'never reads the chat tables directly');
});

test('the haji consent page exists and has a video topic', () => {
  const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  assert.ok(app.includes('<Tab.Screen name="ChatConsent"'));
  assert.ok(VIDEO_TOPICS.ChatConsent);
});

// ---------- guide & dua text corrections ----------
const guide = () => ({ id: 'g1', icon: '🩺', title: 'স্বাস্থ্য', what: 'পানি',
  blocks: [{ type: 'notice', kind: 'warn', title: 'সাবধান', text: 'পুরনো লেখা' }, { type: 'steps', steps: [{ title: 'ধাপ', text: 'করুন' }] }] });

test('the admin sees every text of an item with a Bengali place name, never ids or icons', () => {
  const f = textFields(guide());
  const paths = f.map((x) => x.path);
  assert.deepEqual(paths, ['title', 'what', 'blocks.0.title', 'blocks.0.text', 'blocks.1.steps.0.title', 'blocks.1.steps.0.text']);
  assert.equal(f.find((x) => x.path === 'blocks.1.steps.0.text').label, 'অংশ ২ › ধাপ ১ › লেখা');
  assert.equal(f.find((x) => x.path === 'title').value, 'স্বাস্থ্য');
});

test('corrections change only existing text, and can be undone', () => {
  const list = [guide()];
  applyOverrides(list, [
    { kind: 'guide', item_id: 'g1', path: 'blocks.0.text', body: 'নতুন লেখা' },
    { kind: 'guide', item_id: 'g1', path: 'blocks.9.text', body: 'নেই এমন জায়গা' },
    { kind: 'guide', item_id: 'g1', path: 'blocks', body: 'কাঠামো ভাঙার চেষ্টা' },
    { kind: 'guide', item_id: 'g1', path: 'icon', body: 'x' },
    { kind: 'guide', item_id: 'zz', path: 'title', body: 'অজানা' },
    { kind: 'dua', item_id: 'g1', path: 'title', body: 'অন্য ধরন' },
  ], 'guide');
  assert.equal(list[0].blocks[0].text, 'নতুন লেখা');
  assert.equal(list[0].blocks.length, 2);
  assert.ok(Array.isArray(list[0].blocks));
  assert.equal(list[0].icon, '🩺');
  assert.equal(list[0].title, 'স্বাস্থ্য');
  applyOverrides(list, [], 'guide');
  assert.equal(list[0].blocks[0].text, 'পুরনো লেখা', 'removing the correction brings back the app text');
});

test('a correction can never reach the object prototype', () => {
  const list = [guide()];
  applyOverrides(list, [{ kind: 'guide', item_id: 'g1', path: '__proto__.polluted', body: 'x' },
    { kind: 'guide', item_id: 'g1', path: 'constructor.prototype.polluted', body: 'x' }], 'guide');
  assert.equal({}.polluted, undefined);
});

test('saving: empty text is refused in the app; "reset" sends null', async () => {
  await assert.rejects(setContent('guide', 'g1', 'title', '   '), (e) => e.code === 'empty');
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  await setContent('guide', 'g1', 'title', ' নতুন ');
  assert.deepEqual(calls().at(-1), ['rpc', 'admin_set_content', { p_kind: 'guide', p_item: 'g1', p_path: 'title', p_body: 'নতুন' }]);
  await setContent('guide', 'g1', 'title', null);
  assert.equal(calls().at(-1)[2].p_body, null);
});
