// The privacy policy and the permission texts must say what the app really does (found Oct 2026: SOS sends the
// location, but the policy still said the location never leaves the phone). Written before the fix (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../../src/content/privacy.js';

const all = JSON.stringify(P);
const appJson = readFileSync(new URL('../../app.json', import.meta.url), 'utf8');

test('the policy never claims the location is never sent', () => {
  assert.ok(!/অবস্থান[^"]*কোথাও পাঠানো হয় না/.test(all), 'remove "location is never sent"');
});
test('the policy explains the SOS record and that the location goes only when the haji turned it on', () => {
  assert.ok(/জরুরি/.test(all) && /চালু করলে/.test(all) && /অবস্থান/.test(all));
  assert.ok(/কোন নম্বরে/.test(all), 'which emergency number was called is recorded');
});
test('the policy explains reading the help chat only with the haji\'s consent', () => {
  assert.ok(/প্রশ্ন-উত্তর/.test(all) && /অনুমতি/.test(all) && /৭ দিন/.test(all));
});
test('the location permission text on the phone does not say it stays on the phone', () => {
  assert.ok(!/শুধু ফোনেই থাকে/.test(appJson));
  assert.ok(/জরুরি/.test(appJson));
});

test('the policy explains the help fund: application details stay private, names only with consent', () => {
  assert.ok(/সহায়তা তহবিল/.test(all) && /রাজি/.test(all) && /পরিচিত/.test(all));
});
