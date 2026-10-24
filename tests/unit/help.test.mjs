// Group help chat + khadems, app side (src/lib/help.js) — written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './stubs/supabase.mjs';
import { checkMessage, roleLabel, sortInbox, helpErrorText, sendHelp, replyHelp, addKhadem, khademResultText, saveFaq } from '../../src/lib/help.js';

beforeEach(() => reset());
const calls = () => globalThis.__sbCalls;

test('message check: empty and too long are stopped before sending', () => {
  assert.equal(checkMessage('   '), 'কিছু লিখুন।');
  assert.ok(checkMessage('ক'.repeat(1001)).includes('১০০০'));
  assert.equal(checkMessage('  রুমের চাবি কাজ করছে না  '), null);
});

test('who wrote: clear Bengali label with icon (never colour only)', () => {
  assert.equal(roleLabel('haji', true), '🕋 আপনি');
  assert.equal(roleLabel('haji', false), '🕋 হাজী');
  assert.equal(roleLabel('leader'), '🧭 লিডার');
  assert.equal(roleLabel('khadem'), '🤝 খাদেম');
});

test('inbox: unanswered questions first, then newest', () => {
  const rows = [
    { thread_id: 'a', last_from_haji: false, last_at: '2026-10-24T10:00:00Z', status: 'open' },
    { thread_id: 'b', last_from_haji: true, last_at: '2026-10-24T08:00:00Z', status: 'open' },
    { thread_id: 'c', last_from_haji: true, last_at: '2026-10-24T09:00:00Z', status: 'open' },
    { thread_id: 'd', last_from_haji: true, last_at: '2026-10-24T11:00:00Z', status: 'closed' },
  ];
  assert.deepEqual(sortInbox(rows).map((r) => r.thread_id), ['c', 'b', 'a', 'd']);
});

test('server refusals become plain Bengali; never a fake success', () => {
  assert.ok(helpErrorText({ message: 'too many messages' }).includes('একটু পরে'));
  assert.ok(helpErrorText({ message: 'not a member' }).includes('দলে'));
  assert.ok(helpErrorText({ message: 'not allowed' }).length > 5);
  assert.ok(helpErrorText({ message: 'Failed to fetch' }).includes('ইন্টারনেট'));
});

test('sending: trimmed text goes to help_send; a refusal throws', async () => {
  globalThis.__sb = { rpc: () => ({ data: 'th1', error: null }) };
  await sendHelp('g1', '  চাবি কাজ করছে না ');
  assert.deepEqual(calls().at(-1), ['rpc', 'help_send', { p_group: 'g1', p_body: 'চাবি কাজ করছে না' }]);
  await assert.rejects(sendHelp('g1', '   '), { code: 'empty' });
  globalThis.__sb = { rpc: () => ({ data: null, error: { message: 'too many messages' } }) };
  await assert.rejects(replyHelp('th1', 'উত্তর'), { message: 'too many messages' });
});

test('adding a khadem: ID or phone (Bengali digits ok); every answer explained', async () => {
  globalThis.__sb = { rpc: (n, a) => ({ data: 'ok', error: null }) };
  assert.equal(await addKhadem('g1', ' ta-00042 '), 'ok');
  assert.deepEqual(calls().at(-1), ['rpc', 'leader_add_khadem', { p_group: 'g1', p_ident: 'TA-00042' }]);
  await addKhadem('g1', '০১৭১২৩৪৫৬৭৮');
  assert.deepEqual(calls().at(-1), ['rpc', 'leader_add_khadem', { p_group: 'g1', p_ident: '01712345678' }]);
  for (const r of ['ok', 'already', 'not_found', 'self', 'limit']) assert.ok(khademResultText(r).length > 5, r);
});

test('ready answers: question and answer must be filled', async () => {
  await assert.rejects(saveFaq('g1', null, 'ক', 'উত্তর'), { code: 'short' });
  globalThis.__sb = { rpc: () => ({ data: 'f1', error: null }) };
  assert.equal(await saveFaq('g1', null, ' হোটেল কোথায়? ', ' আল-সাফা '), 'f1');
  assert.deepEqual(calls().at(-1), ['rpc', 'leader_faq_save', { p_group: 'g1', p_id: null, p_q: 'হোটেল কোথায়?', p_a: 'আল-সাফা' }]);
});
