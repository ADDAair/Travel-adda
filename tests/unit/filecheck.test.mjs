// Security step 3 (owner choice 7 Nov 2026), finding F10: the server only trusts the file type the app DECLARES.
// So the app now looks at the first bytes of every file before uploading it, and refuses anything that is not
// really a picture / PDF / sound / video. Written first (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sniff, checkFile } from '../../src/lib/fileCheck.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, 'utf8');
const B = (hex, pad = 32) => { const b = Buffer.alloc(pad); Buffer.from(hex.replace(/ /g, ''), 'hex').copy(b); return new Uint8Array(b).buffer; };
const T = (s) => new Uint8Array(Buffer.from(s.padEnd(32, ' '))).buffer;

test('real file types are recognised from their first bytes', () => {
  assert.equal(sniff(B('ffd8ffe0')), 'jpeg');
  assert.equal(sniff(B('89504e470d0a1a0a')), 'png');
  assert.equal(sniff(T('%PDF-1.7')), 'pdf');
  assert.equal(sniff(B('00000018 66747970 6d703432')), 'mp4');   // ....ftypmp42
  assert.equal(sniff(B('00000014 66747970 33677035')), 'mp4');   // ....ftyp3gp5 (3GPP video)
  assert.equal(sniff(B('00000020 66747970 4d344120')), 'mp4');   // ....ftypM4A  (m4a sound)
  assert.equal(sniff(B('fff1')), 'aac');
  assert.equal(sniff(T('ID3')), 'mp3');
  assert.equal(sniff(B('fffb')), 'mp3');
  assert.equal(sniff(T('OggS')), 'ogg');
  assert.equal(sniff(T('#!AMR')), 'amr');
});

test('web pages, SVG, programs, archives and empty files are not recognised', () => {
  for (const bad of [T('<html><script>'), T('<?xml version="1.0"?><svg'), T('<svg xmlns='), B('4d5a9000'), B('504b0304'), B('7f454c46'), new ArrayBuffer(0), B('00000000')])
    assert.equal(sniff(bad), null);
});

test('checkFile only lets through what the upload claims to be', () => {
  assert.doesNotThrow(() => checkFile(B('ffd8ffe0'), 'image'));
  assert.doesNotThrow(() => checkFile(B('89504e470d0a1a0a'), 'image'));
  assert.doesNotThrow(() => checkFile(T('%PDF-1.4'), 'pdf'));
  assert.doesNotThrow(() => checkFile(B('00000018 66747970 6d703432'), 'video'));
  assert.doesNotThrow(() => checkFile(B('fff1'), 'audio'));
  for (const [buf, kind] of [[T('%PDF-1.4'), 'image'], [B('ffd8ffe0'), 'pdf'], [T('<html>'), 'image'], [T('<html>'), 'pdf'], [B('ffd8ffe0'), 'video'], [T('<svg'), 'audio']]) {
    assert.throws(() => checkFile(buf, kind), (e) => e.code === 'bad-file', `${kind} refused`);
  }
});

test('every upload in the app checks the file first', () => {
  for (const f of ['src/lib/docs.ts', 'src/lib/payments.ts', 'src/lib/groups.ts', 'src/lib/avatar.ts', 'src/lib/market.ts']) {
    const s = read(f);
    assert.ok(s.includes("from './fileCheck'"), `${f} imports the check`);
    let at = 0;
    for (;;) {
      const up = s.indexOf('.upload(', at); if (up < 0) break;
      const chk = s.lastIndexOf('checkFile(', up);
      assert.ok(chk > 0 && chk > s.lastIndexOf('async function', up), `${f}: checkFile before the upload at ${up}`);
      at = up + 1;
    }
  }
});

test('a refused file gets a plain Bengali message on every screen that uploads', () => {
  for (const f of ['src/screens/DocsScreen.tsx', 'src/components/PaymentBox.tsx', 'src/screens/LeaderApplyScreen.tsx', 'src/screens/PhotoCapture.tsx'])
    assert.ok(read(f).includes("'bad-file'"), `${f} explains a refused file`);
});

test('F6: the OTP function compares code hashes with safeEqual and has no wildcard CORS', () => {
  const src = read('supabase/functions/phone-otp/index.ts');
  assert.doesNotMatch(src, /\)\) === o\.code_hash/, 'no plain === on the code hash');
  assert.ok(src.includes('safeEqual(await d.hash('), 'safeEqual is used for the code check');
  assert.ok(!src.includes("'Access-Control-Allow-Origin': '*'"), 'no wildcard CORS left');
  assert.ok(src.includes("corsHeaders(req.headers.get('Origin'))"), 'CORS decided per request origin');
});
