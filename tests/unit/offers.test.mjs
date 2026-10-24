// Package approval, edit-until-approved, no qurbani in umrah (src/lib/offers.js) — written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './stubs/supabase.mjs';
import { INCLUDES, includesFor, cleanIncludes, reviewOf, canEditOffer, reviewLabel, updateOffer, reviewOffer, adminOffersReview, offerErrorText }
  from '../../src/lib/offers.js';
import { offerReviewReady } from '../../src/lib/offers.js';
import { keyboardPad } from '../../src/lib/keyboard.js';

beforeEach(() => reset());
const calls = () => globalThis.__sbCalls;

test('umrah packages never offer qurbani; hajj does', () => {
  assert.ok(INCLUDES.some((x) => x.id === 'qurbani'));
  assert.ok(!includesFor('umrah').some((x) => x.id === 'qurbani'));
  assert.ok(includesFor('hajj').some((x) => x.id === 'qurbani'));
  assert.equal(includesFor('umrah').length, INCLUDES.length - 1);
});

test('switching to umrah drops a qurbani that was ticked for hajj', () => {
  assert.deepEqual(cleanIncludes('umrah', ['flight', 'qurbani', 'visa']), ['flight', 'visa']);
  assert.deepEqual(cleanIncludes('hajj', ['flight', 'qurbani']), ['flight', 'qurbani']);
});

test('review state: old packages (before step 019) count as approved', () => {
  assert.equal(reviewOf({}), 'approved');
  assert.equal(reviewOf({ review: 'pending' }), 'pending');
});

test('leader can change a package only until the admin approves it', () => {
  assert.equal(canEditOffer({ review: 'pending' }), true);
  assert.equal(canEditOffer({ review: 'rejected' }), true);
  assert.equal(canEditOffer({ review: 'approved' }), false);
  assert.equal(canEditOffer({}), false);
  assert.equal(canEditOffer({ review: 'pending', hidden_by_admin: true }), false);
});

test('status labels are words with an icon, and a rejection shows the reason', () => {
  assert.ok(reviewLabel({ review: 'pending' }).includes('অনুমোদনের অপেক্ষায়'));
  assert.ok(reviewLabel({ review: 'pending' }).startsWith('⏳'));
  assert.ok(reviewLabel({ review: 'rejected', review_note: 'হোটেলের নাম দিন' }).includes('হোটেলের নাম দিন'));
  assert.equal(reviewLabel({ review: 'approved' }), null);
});

test('updateOffer sends only the details and fails loudly when nothing changed', async () => {
  globalThis.__sb = { from: () => ({ data: [{ id: 'o1' }], error: null }) };
  await updateOffer('o1', { title: 'নতুন নাম', review: 'approved', price_bdt: 10 });
  const ops = calls().find((c) => c[0] === 'from')[2];
  const upd = ops.find((o) => o[0] === 'update')[1];
  assert.equal(upd.title, 'নতুন নাম');
  assert.equal('review' in upd, false, 'the app must never try to approve its own package');
  assert.deepEqual(ops.find((o) => o[0] === 'eq'), ['eq', 'id', 'o1']);
  globalThis.__sb = { from: () => ({ data: [], error: null }) };
  await assert.rejects(updateOffer('o1', { title: 'x y' }), (e) => e.code === 'not-changed');
});

test('admin decision calls the server function; rejecting needs a reason', async () => {
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  assert.equal(await reviewOffer('o1', 'approve'), 'ok');
  assert.deepEqual(calls().at(-1), ['rpc', 'admin_review_offer', { p_offer: 'o1', p_decision: 'approve', p_note: null }]);
  await assert.rejects(reviewOffer('o1', 'reject', '  '), (e) => e.code === 'reason');
  assert.equal(await reviewOffer('o1', 'reject', ' হোটেলের নাম দিন '), 'ok');
  assert.equal(calls().at(-1)[2].p_note, 'হোটেলের নাম দিন');
});

test('admin list falls back to the old list (all approved) before step 019', async () => {
  globalThis.__sb = {
    rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.admin_offers_review' } }),
    from: () => ({ data: [{ id: 'a', title: 't' }], error: null }),
  };
  const rows = await adminOffersReview();
  assert.equal(rows.length, 1);
  assert.equal(reviewOf(rows[0]), 'approved');
});

test('server refusals become plain Bengali', () => {
  assert.ok(offerErrorText({ message: 'approved package cannot be changed' }).includes('অনুমোদনের পর'));
  assert.ok(offerErrorText({ message: 'new row for relation "offers" violates check constraint "offers_umrah_no_qurbani"' }).includes('কুরবানি'));
  assert.ok(offerErrorText({ message: 'departure date has passed' }).includes('তারিখ'));
});

test('keyboard: the screen shrinks by the keyboard height so fields stay visible', () => {
  assert.equal(keyboardPad(0), 0);
  assert.equal(keyboardPad(310.5), 311);
  assert.equal(keyboardPad(-5), 0);
  assert.equal(keyboardPad(undefined), 0);
});

test('the app knows whether the admin check is live (column exists)', async () => {
  globalThis.__sb = { from: () => ({ data: [], error: null }) };
  assert.equal(await offerReviewReady(), true);
  globalThis.__sb = { from: () => ({ data: null, error: { code: '42703', message: 'column offers.review does not exist' } }) };
  assert.equal(await offerReviewReady(), false);
});
