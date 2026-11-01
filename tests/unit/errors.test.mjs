// errInfo: one safe way to read an error's code and message (replaces `(e as any).code`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errInfo } from '../../src/lib/errors.js';

test('reads code and message from Supabase-style and coded errors', () => {
  assert.deepEqual(errInfo({ code: '23505', message: 'duplicate key' }), { code: '23505', message: 'duplicate key' });
  assert.deepEqual(errInfo(Object.assign(new Error('x'), { code: 'short' })), { code: 'short', message: 'x' });
});
test('never throws on odd values', () => {
  assert.deepEqual(errInfo(null), { code: '', message: '' });
  assert.deepEqual(errInfo(undefined), { code: '', message: '' });
  assert.deepEqual(errInfo('boom'), { code: '', message: 'boom' });
  assert.deepEqual(errInfo({ code: 42 }), { code: '42', message: '' });
});
