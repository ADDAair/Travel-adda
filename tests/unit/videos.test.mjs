// "▶️ ভিডিও দেখুন" on every page — written before the code (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIDEO_TOPICS, videoFor } from '../../src/content/videos.js';

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
const routes = [...app.matchAll(/<Tab\.Screen name="([A-Za-z]+)"/g)].map((m) => m[1]);

test('every page of the app has a video topic in Bengali', () => {
  assert.ok(routes.length >= 30, `found ${routes.length} pages`);
  routes.forEach((r) => { assert.ok(VIDEO_TOPICS[r], `no video topic for ${r}`); assert.ok(/[ঀ-৿]/.test(VIDEO_TOPICS[r].title), r); });
});

test('no video yet: it says "শীঘ্রই আসছে", never pretends to play', () => {
  const v = videoFor('Umrah');
  assert.equal(v.ready, false);
  assert.equal(v.label, '▶️ ভিডিও দেখুন (শীঘ্রই আসছে)');
  assert.equal(videoFor('NoSuchPage').ready, false);
});

test('when a safe https link is added, the button plays it; other links are refused', () => {
  const t = { ...VIDEO_TOPICS.Umrah, url: 'https://videos.traveladda.app/umrah.mp4' };
  assert.equal(videoFor('Umrah', { Umrah: t }).ready, true);
  assert.equal(videoFor('Umrah', { Umrah: t }).label, '▶️ ভিডিও দেখুন');
  assert.equal(videoFor('Umrah', { Umrah: { ...t, url: 'http://bad.example/x' } }).ready, false);
  assert.equal(videoFor('Umrah', { Umrah: { ...t, url: 'javascript:alert(1)' } }).ready, false);
});
