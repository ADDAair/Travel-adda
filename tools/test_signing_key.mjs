// Travel Adda's own signing key for the TEST APK (security step 1, Nov 2026).
// Expo's default build signs with the public "Android Debug" key, which anyone has: with it, anyone could make a fake
// "update" that installs over the test app and reads its saved login. So CI re-signs the APK with this key instead.
//
// The key is never stored anywhere: it is re-made, bit for bit the same, from a GitHub secret on every build
// (same secret -> same key -> phones accept the next test APK as an update). Nothing secret is in this file.
// This is ONLY for test builds; the Play Store release gets its own upload key + Play App Signing.
//
// CLI (CI only): TA_SIGN_SEED_SRC=<secret> node tools/test_signing_key.mjs <out dir>  -> <out>/key.pk8, <out>/cert.der
import { createHmac, createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------- deterministic random bits (HMAC-SHA256 in counter mode) ----------
function drbg(seed) {
  const key = createHash('sha256').update(`ami-haji-apk-test-signing-v1:${seed}`).digest();
  let n = 0;
  return (bytes) => {
    const out = [];
    while (out.reduce((s, b) => s + b.length, 0) < bytes) out.push(createHmac('sha256', key).update(`block:${n++}`).digest());
    return Buffer.concat(out).subarray(0, bytes);
  };
}

// ---------- big-number helpers ----------
const big = (buf) => BigInt(`0x${buf.toString('hex') || '0'}`);
function modPow(b, e, m) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; }
function modInv(a, m) {
  let [o, r] = [a % m, m], [s, t] = [1n, 0n];
  while (r !== 0n) { const q = o / r; [o, r] = [r, o - q * r]; [s, t] = [t, s - q * t]; }
  if (o !== 1n) throw new Error('no inverse');
  return ((s % m) + m) % m;
}
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const SMALL = (() => { const p = []; for (let i = 3; p.length < 300; i += 2) if (p.every((q) => i % q)) p.push(i); return p.map(BigInt); })();
function isProbablePrime(n) {
  for (const p of SMALL) if (n % p === 0n) return n === p;
  let d = n - 1n, s = 0; while (!(d & 1n)) { d >>= 1n; s++; }
  for (const a of SMALL.slice(0, 40)) {       // 40 fixed bases: error chance below 2^-80, and deterministic
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let ok = false;
    for (let i = 1; i < s; i++) { x = (x * x) % n; if (x === n - 1n) { ok = true; break; } }
    if (!ok) return false;
  }
  return true;
}
function prime(rand, bits, e) {
  for (;;) {
    const b = Buffer.from(rand(bits / 8)); b[0] |= 0xc0; b[b.length - 1] |= 1;   // top two bits: n has the full length
    const p = big(b);
    if (gcd(e, p - 1n) === 1n && isProbablePrime(p)) return p;
  }
}

// ---------- tiny DER writer ----------
const len = (n) => (n < 128 ? Buffer.from([n]) : (() => { const h = n.toString(16).padStart(n > 255 ? 4 : 2, '0'); return Buffer.concat([Buffer.from([0x80 | (h.length / 2)]), Buffer.from(h, 'hex')]); })());
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...x) => tlv(0x30, Buffer.concat(x));
const set = (...x) => tlv(0x31, Buffer.concat(x));
const oid = (hex) => tlv(0x06, Buffer.from(hex, 'hex'));
const intBuf = (b) => tlv(0x02, b[0] & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b);
const rdn = (oidHex, tag, text) => set(seq(oid(oidHex), tlv(tag, Buffer.from(text, 'utf8'))));
const SHA256_RSA = seq(oid('2a864886f70d01010b'), Buffer.from([0x05, 0x00]));
const b64u = (n) => { let h = n.toString(16); if (h.length % 2) h = `0${h}`; return Buffer.from(h, 'hex').toString('base64url'); };

export function makeTestSigningKey(seed) {
  if (typeof seed !== 'string' || seed.length < 32) throw new Error('the signing secret is missing or too short');
  const rand = drbg(seed);
  const e = 65537n;
  let p = prime(rand, 1024, e), q = prime(rand, 1024, e);
  while (p === q) q = prime(rand, 1024, e);
  if (p < q) [p, q] = [q, p];
  const n = p * q, d = modInv(e, (p - 1n) * (q - 1n));
  const key = createPrivateKey({ format: 'jwk', key: { kty: 'RSA', n: b64u(n), e: b64u(e), d: b64u(d), p: b64u(p), q: b64u(q),
    dp: b64u(d % (p - 1n)), dq: b64u(d % (q - 1n)), qi: b64u(modInv(q, p)) } });
  const spki = createPublicKey(key).export({ type: 'spki', format: 'der' });
  const serial = Buffer.from(rand(16)); serial[0] &= 0x7f; serial[0] |= 0x01;
  const name = seq(rdn('550406', 0x13, 'BD'), rdn('55040a', 0x0c, 'Travel Adda'), rdn('550403', 0x0c, 'Ami Haji Test'));
  const validity = seq(tlv(0x17, Buffer.from('260101000000Z')), tlv(0x18, Buffer.from('20760101000000Z')));
  const tbs = seq(tlv(0xa0, intBuf(Buffer.from([2]))), intBuf(serial), SHA256_RSA, name, validity, name, spki);
  const sig = sign('sha256', tbs, key);                       // RSA PKCS#1 v1.5: the same bytes every time
  const certDer = seq(tbs, SHA256_RSA, tlv(0x03, Buffer.concat([Buffer.from([0]), sig])));
  return { certDer, keyPk8: key.export({ type: 'pkcs8', format: 'der' }) };
}

if (process.argv[1] && process.argv[1].endsWith('test_signing_key.mjs')) {
  const out = process.argv[2];
  if (!out) { console.error('usage: TA_SIGN_SEED_SRC=... node tools/test_signing_key.mjs <out dir>'); process.exit(2); }
  const { certDer, keyPk8 } = makeTestSigningKey(process.env.TA_SIGN_SEED_SRC);
  mkdirSync(out, { recursive: true, mode: 0o700 });
  writeFileSync(join(out, 'key.pk8'), keyPk8, { mode: 0o600 });
  writeFileSync(join(out, 'cert.der'), certDer, { mode: 0o644 });
  console.log(`test signing certificate SHA-256: ${createHash('sha256').update(certDer).digest('hex')}`);   // public, safe to print
}
