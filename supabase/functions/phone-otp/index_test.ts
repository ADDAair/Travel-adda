// Run: deno test supabase/functions/phone-otp/   (CI runs this on every push)
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { handle, sendSmsVia, cleanPhone, type Deps, type Otp } from './index.ts';

function world() {
  let t = 1_000_000_000_000;
  let codeSeq = 0;
  let idSeq = 0;
  const otps: Otp[] = [];
  const sms: { phone: string; text: string }[] = [];
  const verified = new Set<string>();
  const passwords: Record<string, string> = {};
  const profiles = [
    { id: 'u1', phone: '01710000001', phone_verified: false, status: 'active' },
    { id: 'u2', phone: '01710000002', phone_verified: true, status: 'active' },
    { id: 'u3', phone: '01710000003', phone_verified: false, status: 'suspended' },
  ];
  const d: Deps = {
    now: () => t,
    randomCode: () => String(123450 + (codeSeq++)).padStart(6, '0'),
    hash: (s) => Promise.resolve('h:' + s.split('').reverse().join('')),
    userFromJwt: (jwt) => Promise.resolve(jwt === 'jwt-u1' ? 'u1' : jwt === 'jwt-u2' ? 'u2' : jwt === 'jwt-u3' ? 'u3' : null),
    profileById: (id) => Promise.resolve(profiles.find((p) => p.id === id) ?? null),
    profileByPhone: (ph) => Promise.resolve(profiles.find((p) => p.phone === ph) ?? null),
    recentOtps: (ph, since) => Promise.resolve(otps.filter((o) => o.phone === ph && o.created_at >= since).sort((a, b) => b.created_at - a.created_at)),
    countSmsSince: (since) => Promise.resolve(otps.filter((o) => o.sms_sent && o.created_at >= since).length),
    countIpSince: (ip, since) => Promise.resolve(otps.filter((o) => o.ip === ip && o.created_at >= since).length),
    countPhoneSince: (ph, since) => Promise.resolve(otps.filter((o) => o.phone === ph && o.created_at >= since).length),
    insertOtp: (o) => { const id = 'o' + String(++idSeq).padStart(4, '0'); otps.push({ ...o, id }); return Promise.resolve(id); },
    claimTry: (id, expect, patch) => { const o = otps.find((x) => x.id === id)!; if (o.attempts !== expect || o.used) return Promise.resolve(false); Object.assign(o, patch); return Promise.resolve(true); },
    updateOtp: (id, patch) => { Object.assign(otps.find((o) => o.id === id)!, patch); return Promise.resolve(); },
    deleteOtp: (id) => { const i = otps.findIndex((o) => o.id === id); if (i >= 0) otps.splice(i, 1); return Promise.resolve(); },
    setVerified: (uid) => { verified.add(uid); const p = profiles.find((x) => x.id === uid); if (p) p.phone_verified = true; return Promise.resolve(); },
    setPassword: (uid, pw) => { passwords[uid] = pw; return Promise.resolve(); },
    sendSms: (phone, text) => { sms.push({ phone, text }); return Promise.resolve(true); },
    dailyCap: 300,
  };
  return { d, otps, sms, verified, passwords, profiles, tick: (ms: number) => { t += ms; } };
}
const codeOf = (text: string) => text.match(/\d{6}/)![0];

Deno.test('verify: needs sign-in, sends a 6-digit code, stores only a hash', async () => {
  const w = world();
  assertEquals((await handle(w.d, { action: 'send_verify' }, null)).status, 401);
  assertEquals((await handle(w.d, { action: 'send_verify' }, 'jwt-bad')).status, 401);
  assertEquals((await handle(w.d, { action: 'send_verify' }, 'jwt-u3')).status, 403);   // suspended
  const r = await handle(w.d, { action: 'send_verify' }, 'jwt-u1');
  assertEquals(r.status, 200);
  assertEquals(w.sms.length, 1);
  assertEquals(w.sms[0].phone, '01710000001');
  const code = codeOf(w.sms[0].text);
  assert(!w.otps[0].code_hash.includes(code), 'plain code must not be stored');
});

Deno.test('verify: resend limits, wrong code, then correct code marks number verified', async () => {
  const w = world();
  await handle(w.d, { action: 'send_verify' }, 'jwt-u1');
  const again = await handle(w.d, { action: 'send_verify' }, 'jwt-u1');
  assertEquals(again.status, 429); assertEquals(again.body.error, 'wait');
  w.tick(61_000);
  await handle(w.d, { action: 'send_verify' }, 'jwt-u1');
  const code = codeOf(w.sms[1].text);
  const old = await handle(w.d, { action: 'check_verify', code: codeOf(w.sms[0].text) }, 'jwt-u1');   // the first code no longer works
  assertEquals(old.body.error, 'wrong_code'); assertEquals(old.body.tries_left, 4);
  const wrong = await handle(w.d, { action: 'check_verify', code: '000000' }, 'jwt-u1');
  assertEquals(wrong.body.error, 'wrong_code'); assertEquals(wrong.body.tries_left, 3);
  assertEquals((await handle(w.d, { action: 'check_verify', code: '12' }, 'jwt-u1')).body.error, 'bad_code');
  const good = await handle(w.d, { action: 'check_verify', code: code.replace(/\d/g, (x) => '০১২৩৪৫৬৭৮৯'[Number(x)]) }, 'jwt-u1');   // Bengali digits accepted
  assertEquals(good.status, 200); assert(w.verified.has('u1'));
  assertEquals((await handle(w.d, { action: 'check_verify', code }, 'jwt-u1')).body.already, true);
  assertEquals((await handle(w.d, { action: 'send_verify' }, 'jwt-u2')).body.already, true);
});

Deno.test('verify: five wrong guesses kill the code; codes expire after 5 minutes; 3 per hour', async () => {
  const w = world();
  await handle(w.d, { action: 'send_verify' }, 'jwt-u1');
  const code = codeOf(w.sms[0].text);
  for (let i = 0; i < 5; i++) await handle(w.d, { action: 'check_verify', code: '999999' }, 'jwt-u1');
  assertNotEquals((await handle(w.d, { action: 'check_verify', code }, 'jwt-u1')).status, 200);
  w.tick(61_000); await handle(w.d, { action: 'send_verify' }, 'jwt-u1');
  w.tick(5 * 60_000 + 1000);
  assertEquals((await handle(w.d, { action: 'check_verify', code: codeOf(w.sms[1].text) }, 'jwt-u1')).body.error, 'expired');
  w.tick(61_000); assertEquals((await handle(w.d, { action: 'send_verify' }, 'jwt-u1')).status, 200);
  w.tick(61_000); assertEquals((await handle(w.d, { action: 'send_verify' }, 'jwt-u1')).body.error, 'too_many');
  assert(!w.verified.has('u1'));
});

Deno.test('reset: same answer for unknown numbers, no SMS for them; weak password refused; works with code', async () => {
  const w = world();
  const unknown = await handle(w.d, { action: 'send_reset', phone: '01799999999' }, null);
  const known = await handle(w.d, { action: 'send_reset', phone: '+880 1710-000002' }, null);
  assertEquals(unknown.body, known.body);
  assertEquals(w.sms.length, 1); assertEquals(w.sms[0].phone, '01710000002');
  assertEquals((await handle(w.d, { action: 'send_reset', phone: '12345' }, null)).body.error, 'bad_phone');
  const code = codeOf(w.sms[0].text);
  assertEquals((await handle(w.d, { action: 'check_reset', phone: '01710000002', code, password: '1234' }, null)).body.error, 'weak_password');
  assertEquals((await handle(w.d, { action: 'check_reset', phone: '01710000002', code, password: '12345678' }, null)).body.error, 'weak_password');
  assertEquals((await handle(w.d, { action: 'check_reset', phone: '01799999999', code, password: 'Karim2026!' }, null)).body.error, 'wrong_code');
  const r = await handle(w.d, { action: 'check_reset', phone: '01710000002', code, password: 'Karim2026!' }, null);
  assertEquals(r.status, 200); assertEquals(w.passwords.u2, 'Karim2026!');
  assertNotEquals((await handle(w.d, { action: 'check_reset', phone: '01710000002', code, password: 'Other2026!' }, null)).status, 200);   // one use only
});

Deno.test('a verify code can never reset a password, and suspended accounts cannot reset', async () => {
  const w = world();
  await handle(w.d, { action: 'send_verify' }, 'jwt-u1');
  const code = codeOf(w.sms[0].text);
  assertNotEquals((await handle(w.d, { action: 'check_reset', phone: '01710000001', code, password: 'Karim2026!' }, null)).status, 200);
  assertEquals(w.passwords.u1, undefined);
  await handle(w.d, { action: 'send_reset', phone: '01710000003' }, null);
  assertEquals(w.sms.length, 1);   // no SMS to a suspended account
});

Deno.test('daily SMS cap and per-address limit protect the SMS balance', async () => {
  const w = world(); w.d.dailyCap = 2;
  await handle(w.d, { action: 'send_reset', phone: '01710000001' }, null, '1.1.1.1');
  await handle(w.d, { action: 'send_reset', phone: '01710000002' }, null, '1.1.1.2');
  // unknown numbers do not use up the cap
  for (let i = 0; i < 3; i++) assertEquals((await handle(w.d, { action: 'send_reset', phone: `0181000000${i}` }, null, '1.1.1.3')).status, 200);
  w.tick(61_000);
  // a known number over the cap gets the SAME answer as an unknown one (no "this number has an account" leak), and no SMS
  const before = w.sms.length;
  assertEquals((await handle(w.d, { action: 'send_reset', phone: '01710000001' }, null, '1.1.1.4')).body, (await handle(w.d, { action: 'send_reset', phone: '01810000009' }, null, '1.1.1.5')).body);
  assertEquals(w.sms.length, before);
  // signed-in verification still says clearly that the daily cap is reached
  w.tick(61_000);
  assertEquals((await handle(w.d, { action: 'send_verify' }, 'jwt-u1', '1.1.1.6')).body.error, 'daily_cap');
  const v = world();
  for (let i = 0; i < 10; i++) await handle(v.d, { action: 'send_reset', phone: `0191000000${i}`.slice(0, 11) }, null, '9.9.9.9');
  assertEquals((await handle(v.d, { action: 'send_reset', phone: '01710000001' }, null, '9.9.9.9')).body.error, 'too_many');
});

Deno.test('unknown action and phone cleaning', async () => {
  const w = world();
  assertEquals((await handle(w.d, { action: 'drop_tables' }, null)).status, 400);
  assertEquals(cleanPhone('+৮৮০ ১৭১০-০০০০০১'), '01710000001');
  assertEquals(cleanPhone('8801710000001'), '01710000001');
});

Deno.test('SMS companies: request shape and success detection', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const mk = (json: unknown, status = 200) => ((url: string, init?: RequestInit) => { calls.push({ url, init }); return Promise.resolve(new Response(JSON.stringify(json), { status })); }) as unknown as typeof fetch;
  const env = (m: Record<string, string>) => (k: string) => m[k];
  assert(await sendSmsVia('bulksmsbd', env({ SMS_API_KEY: 'K', SMS_SENDER_ID: 'S' }), '01710000001', 'hi 123456', mk({ response_code: 202 })));
  assert(calls[0].url.includes('number=8801710000001') && calls[0].url.includes('api_key=K'));
  assert(!(await sendSmsVia('bulksmsbd', env({}), '01710000001', 'x', mk({ response_code: 1007 }))));
  assert(await sendSmsVia('alphasms', env({ SMS_API_KEY: 'K' }), '01710000001', 'x', mk({ error: 0 })));
  assert(!(await sendSmsVia('alphasms', env({ SMS_API_KEY: 'K' }), '01710000001', 'x', mk({ error: 405 }))));
  assert(await sendSmsVia('sslwireless', env({ SMS_API_KEY: 'K', SMS_SENDER_ID: 'S' }), '01710000001', 'x', mk({ status: 'SUCCESS' })));
  assert(await sendSmsVia('custom_get', env({ SMS_URL_TEMPLATE: 'https://x.test/s?to={to}&m={msg}' }), '01710000001', 'a b', mk({})));
  assert(calls.at(-1)!.url === 'https://x.test/s?to=8801710000001&m=a%20b');
  assert(!(await sendSmsVia('custom_get', env({ SMS_URL_TEMPLATE: 'https://x.test/none' }), '01710000001', 'x', mk({}))));
  assert(!(await sendSmsVia('nobody', env({}), '01710000001', 'x', mk({}))));
  assert(!(await sendSmsVia('bulksmsbd', env({}), '01710000001', 'x', (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch)));
});

Deno.test('security: parallel guesses cannot bypass the 5-tries limit', async () => {
  const w = world();
  await handle(w.d, { action: 'send_reset', phone: '01710000002' }, null);
  const code = codeOf(w.sms[0].text);
  // 200 guesses fired at the same moment (all read attempts = 0 before any write)
  const guesses = Array.from({ length: 200 }, (_, i) => String(i).padStart(6, '0')).filter((g) => g !== code);
  const rs = await Promise.all(guesses.map((g) => handle(w.d, { action: 'check_reset', phone: '01710000002', code: g, password: 'Karim2026!' }, null)));
  assert(rs.filter((r) => r.body.error === 'wrong_code').length <= 5, 'at most 5 guesses may be checked');
  assertEquals(w.otps.length, 1); assert(w.otps[0].attempts <= 5);
  assertEquals(w.passwords.u2, undefined);
  // the requests that lost the race were refused without being checked; once 5 guesses are used up the code is dead
  for (let i = 0; i < 5; i++) await handle(w.d, { action: 'check_reset', phone: '01710000002', code: '999999', password: 'Karim2026!' }, null);
  assertNotEquals((await handle(w.d, { action: 'check_reset', phone: '01710000002', code, password: 'Karim2026!' }, null)).status, 200);
  assertEquals(w.passwords.u2, undefined);
});

Deno.test('security: sending in parallel sends one SMS only; at most 8 codes a day per number', async () => {
  const w = world();
  const rs = await Promise.all(Array.from({ length: 20 }, () => handle(w.d, { action: 'send_reset', phone: '01710000002' }, null)));
  assertEquals(w.sms.length, 1);
  assert(rs.every((r) => r.status === 200 || r.status === 429));
  const v = world();
  let sent = 0;
  for (let i = 0; i < 12; i++) { v.tick(21 * 60_000); const r = await handle(v.d, { action: 'send_verify' }, 'jwt-u1'); if (r.status === 200) sent++; }
  assertEquals(sent, 8);
});

Deno.test('security: reset answers never reveal whether a number has an account, even when SMS fails', async () => {
  const w = world();
  w.d.sendSms = () => Promise.resolve(false);
  const known = await handle(w.d, { action: 'send_reset', phone: '01710000002' }, null);
  const unknown = await handle(w.d, { action: 'send_reset', phone: '01810000001' }, null);
  assertEquals(known.status, unknown.status); assertEquals(known.body, unknown.body);
  assertEquals((await handle(w.d, { action: 'send_verify' }, 'jwt-u1')).body.error, 'sms_failed');   // own number: told plainly
});
