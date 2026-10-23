// Travel Adda – phone number verification and "forgot password" with an SMS code (Supabase Edge Function).
// One file on purpose: it can be pasted into Supabase Dashboard > Edge Functions as-is.
//
// Secrets to set in Supabase (Dashboard > Edge Functions > Secrets). Never put them in the app or in GitHub:
//   SMS_PROVIDER   bulksmsbd | alphasms | sslwireless | custom_get
//   SMS_API_KEY    the key / token from the SMS company
//   SMS_SENDER_ID  sender id given by the SMS company (if they require one)
//   SMS_URL_TEMPLATE  only for custom_get, e.g. https://example.com/send?key=KEY&to={to}&msg={msg}
//   OTP_DAILY_CAP  optional, most SMS per day for the whole app (default 300) – protects the SMS balance
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Actions (POST JSON):
//   { action: 'send_verify' }                         signed-in user: send a code to their own number
//   { action: 'check_verify', code }                  signed-in user: confirm the code -> number verified
//   { action: 'send_reset', phone }                   anyone: send a reset code (same answer whether or not the number exists)
//   { action: 'check_reset', phone, code, password }  anyone: confirm the code and set a new password

export type Otp = { id: string; phone: string; purpose: 'verify' | 'reset'; code_hash: string; attempts: number; used: boolean; sms_sent: boolean; ip: string | null; expires_at: number; created_at: number };
export type Deps = {
  now: () => number;
  randomCode: () => string;
  hash: (s: string) => Promise<string>;
  userFromJwt: (jwt: string) => Promise<string | null>;                 // user id or null
  profileById: (id: string) => Promise<{ id: string; phone: string; phone_verified: boolean; status: string } | null>;
  profileByPhone: (phone: string) => Promise<{ id: string; phone: string; status: string } | null>;
  recentOtps: (phone: string, sinceMs: number) => Promise<Otp[]>;      // newest first, any purpose
  countSmsSince: (sinceMs: number) => Promise<number>;                 // SMS really sent, whole app
  countIpSince: (ip: string, sinceMs: number) => Promise<number>;      // codes asked from one internet address
  countPhoneSince: (phone: string, sinceMs: number) => Promise<number>; // codes for one number, any purpose
  insertOtp: (o: Omit<Otp, 'id'>) => Promise<string>;                 // returns the new row id
  updateOtp: (id: string, patch: Partial<Otp>) => Promise<void>;
  deleteOtp: (id: string) => Promise<void>;
  // Atomic "compare and set": changes the row only if it still has `expect` attempts and is unused. true = this request won.
  // Stops many parallel guesses from all reading attempts=0 (which would bypass the 5-tries limit).
  claimTry: (id: string, expect: number, patch: Partial<Otp>) => Promise<boolean>;
  setVerified: (userId: string) => Promise<void>;
  setPassword: (userId: string, password: string) => Promise<void>;
  sendSms: (phone: string, text: string) => Promise<boolean>;
  dailyCap: number;
};

const CODE_TTL = 5 * 60 * 1000;
const MIN_GAP = 60 * 1000;          // one SMS per number per minute
const PER_HOUR = 3;                 // and at most 3 per hour
const MAX_TRIES = 5;                // wrong guesses allowed per code
const PER_IP_HOUR = 10;             // codes per internet address per hour
const PER_DAY = 8;                  // codes per number per day (guessing stays hopeless: at most 40 tries a day out of 1,000,000)
const PHONE_RE = /^01[3-9][0-9]{8}$/;

export const cleanPhone = (p: unknown) => {
  let s = String(p ?? '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/[^\d+]/g, '');
  if (s.startsWith('+880')) s = '0' + s.slice(4); else if (s.startsWith('880')) s = '0' + s.slice(3);
  return s;
};
const strongEnough = (pw: unknown) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 72 && !/^(.)\1+$/.test(pw) && !/^(12345678|123456789|password|11111111)$/i.test(pw);

type Res = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown>): Res => ({ status: 200, body: { ok: true, ...body } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Res => ({ status, body: { ok: false, error, ...extra } });

async function issue(d: Deps, phone: string, purpose: 'verify' | 'reset', realSend: boolean, ip: string | null): Promise<Res> {
  const now = d.now();
  if (ip && (await d.countIpSince(ip, now - 60 * 60 * 1000)) >= PER_IP_HOUR) return fail(429, 'too_many');
  const recent = await d.recentOtps(phone, now - 60 * 60 * 1000);
  if (recent.length && now - recent[0].created_at < MIN_GAP) return fail(429, 'wait', { retry_in: Math.ceil((MIN_GAP - (now - recent[0].created_at)) / 1000) });
  if (recent.length >= PER_HOUR) return fail(429, 'too_many');
  if ((await d.countPhoneSince(phone, now - 24 * 60 * 60 * 1000)) >= PER_DAY) return fail(429, 'too_many');
  if (realSend && (await d.countSmsSince(now - 24 * 60 * 60 * 1000)) >= d.dailyCap) return fail(503, 'daily_cap');
  const code = d.randomCode();
  // Old codes for this purpose stop working as soon as a new one is sent.
  for (const o of recent) if (o.purpose === purpose && !o.used) await d.updateOtp(o.id, { used: true });
  const myId = await d.insertOtp({ phone, purpose, code_hash: await d.hash(`${purpose}:${phone}:${code}`), attempts: 0, used: false, sms_sent: realSend, ip, expires_at: now + CODE_TTL, created_at: now });
  // Many requests at the same moment: only the first one sends; the others are cancelled (no SMS flood, limits hold).
  const race = await d.recentOtps(phone, now - MIN_GAP);
  const mine = race.find((o) => o.id === myId);
  const first = race.filter((o) => o.created_at > now - MIN_GAP).sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1))[0];
  if (mine && first && first.id !== myId) { await d.deleteOtp(myId); return fail(429, 'wait', { retry_in: Math.ceil(MIN_GAP / 1000) }); }
  if (realSend) {
    const sent = await d.sendSms(phone, `Travel Adda code: ${code}. Valid 5 minutes. Do not share it with anyone.`);
    if (!sent) return fail(502, 'sms_failed');
  }
  return ok({ sent: true, ttl: CODE_TTL / 1000 });
}

async function check(d: Deps, phone: string, purpose: 'verify' | 'reset', code: unknown): Promise<Res | Otp> {
  const c = String(code ?? '').replace(/[০-৯]/g, (x) => String('০১২৩৪৫৬৭৮৯'.indexOf(x))).replace(/\D/g, '');
  if (c.length !== 6) return fail(400, 'bad_code');
  const now = d.now();
  const o = (await d.recentOtps(phone, now - CODE_TTL - 60000)).find((x) => x.purpose === purpose && !x.used);
  if (!o || o.expires_at < now) return fail(400, 'expired');
  const seen = o.attempts;            // the value this request read (the row may change meanwhile)
  if (seen >= MAX_TRIES) { await d.updateOtp(o.id, { used: true }); return fail(400, 'too_many_tries'); }
  const tries = seen + 1;
  const right = (await d.hash(`${purpose}:${phone}:${c}`)) === o.code_hash;
  // Every guess is counted atomically BEFORE the answer is given; a guess that lost the race is refused unchecked.
  if (!(await d.claimTry(o.id, seen, { attempts: tries, used: right || tries >= MAX_TRIES }))) return fail(429, 'wait', { retry_in: 2 });
  if (!right) return fail(400, 'wrong_code', { tries_left: Math.max(0, MAX_TRIES - tries) });
  return o;
}

export async function handle(d: Deps, body: Record<string, unknown>, jwt: string | null, ip: string | null = null): Promise<Res> {
  const action = String(body?.action ?? '');
  if (action === 'send_verify' || action === 'check_verify') {
    const uid = jwt ? await d.userFromJwt(jwt) : null;
    if (!uid) return fail(401, 'not_signed_in');
    const p = await d.profileById(uid);
    if (!p || p.status !== 'active') return fail(403, 'not_allowed');
    if (p.phone_verified) return ok({ already: true });
    if (action === 'send_verify') return issue(d, p.phone, 'verify', true, ip);
    const r = await check(d, p.phone, 'verify', body.code);
    if ('status' in r) return r;
    await d.setVerified(uid);
    return ok({ verified: true });
  }
  if (action === 'send_reset' || action === 'check_reset') {
    const phone = cleanPhone(body.phone);
    if (!PHONE_RE.test(phone)) return fail(400, 'bad_phone');
    if (action === 'send_reset') {
      const p = await d.profileByPhone(phone);
      // Same answer whether or not the number has an account, so nobody can find out who uses the app.
      // A code row is still stored for unknown numbers so the rate limits behave the same, but no SMS is sent.
      const r = await issue(d, phone, 'reset', !!p && p.status === 'active', ip);
      // An SMS failure or the daily cap only ever happen for numbers WITH an account, so they would tell a stranger
      // "this number uses Travel Adda". They get the same answer as everyone else (the app says "if an account exists").
      if (r.status === 200 || r.body.error === 'sms_failed' || r.body.error === 'daily_cap') {
        if (r.status !== 200) console.error('send_reset not delivered', r.body.error);
        return ok({ sent: true, ttl: CODE_TTL / 1000 });
      }
      return r;
    }
    if (!strongEnough(body.password)) return fail(400, 'weak_password');
    const r = await check(d, phone, 'reset', body.code);
    if ('status' in r) return r;
    const p = await d.profileByPhone(phone);
    if (!p || p.status !== 'active') return fail(400, 'expired');
    await d.setPassword(p.id, String(body.password));
    await d.setVerified(p.id);       // they proved they hold this number
    return ok({ reset: true });
  }
  return fail(400, 'bad_action');
}

// ---------------------------------------------------------------------------------------------------------------
// SMS companies. Check the exact API with your company before going live; only the selected one is used.
export async function sendSmsVia(provider: string, env: (k: string) => string | undefined, phone: string, text: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const key = env('SMS_API_KEY') ?? '';
  const sender = env('SMS_SENDER_ID') ?? '';
  const to880 = '88' + phone;                       // 01XXXXXXXXX -> 8801XXXXXXXXX
  try {
    if (provider === 'bulksmsbd') {
      const u = `https://bulksmsbd.net/api/smsapi?api_key=${encodeURIComponent(key)}&type=text&number=${to880}&senderid=${encodeURIComponent(sender)}&message=${encodeURIComponent(text)}`;
      const r = await fetcher(u); const j = await r.json().catch(() => ({}));
      if (!(r.ok && Number(j.response_code) === 202)) console.error('bulksmsbd refused', r.status, j.response_code, String(j.error_message ?? '').split(key).join('***').slice(0, 200));   // reason only; the company may echo the key, so it is blanked
      return r.ok && Number(j.response_code) === 202;
    }
    if (provider === 'alphasms') {
      const f = new URLSearchParams({ api_key: key, msg: text, to: to880 }); if (sender) f.set('sender_id', sender);
      const r = await fetcher('https://api.sms.net.bd/sendsms', { method: 'POST', body: f });
      const j = await r.json().catch(() => ({}));
      return r.ok && Number(j.error) === 0;
    }
    if (provider === 'sslwireless') {
      const r = await fetcher('https://smsplus.sslwireless.com/api/v3/send-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_token: key, sid: sender, msisdn: to880, sms: text, csms_id: crypto.randomUUID().replace(/-/g, '').slice(0, 20) }),
      });
      const j = await r.json().catch(() => ({}));
      return r.ok && String(j.status).toUpperCase() === 'SUCCESS';
    }
    if (provider === 'custom_get') {
      const t = env('SMS_URL_TEMPLATE') ?? '';
      if (!t.includes('{to}') || !t.includes('{msg}')) return false;
      const r = await fetcher(t.replace('{to}', to880).replace('{msg}', encodeURIComponent(text)));
      return r.ok;
    }
  } catch (_e) { return false; }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// Real wiring (runs only on Supabase).
if (import.meta.main) {
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const env = (k: string) => Deno.env.get(k);
  const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const pepper = env('SUPABASE_SERVICE_ROLE_KEY')!;
  const ms = (t: string) => new Date(t).getTime();
  const toOtp = (r: Record<string, unknown>): Otp => ({ ...(r as unknown as Otp), expires_at: ms(r.expires_at as string), created_at: ms(r.created_at as string) });
  const must = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };

  const deps: Deps = {
    now: () => Date.now(),
    randomCode: () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0'),
    hash: async (s) => {
      const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(s));
      return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
    },
    userFromJwt: async (jwt) => { const { data } = await admin.auth.getUser(jwt); return data?.user?.id ?? null; },
    profileById: async (id) => must(await admin.from('profiles').select('id,phone,phone_verified,status').eq('id', id).maybeSingle()),
    profileByPhone: async (phone) => must(await admin.from('profiles').select('id,phone,status').eq('phone', phone).maybeSingle()),
    recentOtps: async (phone, since) => (must(await admin.from('phone_otps').select('*').eq('phone', phone).gte('created_at', new Date(since).toISOString()).order('created_at', { ascending: false }).limit(20)) as Record<string, unknown>[]).map(toOtp),
    countSmsSince: async (since) => { const r = await admin.from('phone_otps').select('id', { count: 'exact', head: true }).eq('sms_sent', true).gte('created_at', new Date(since).toISOString()); if (r.error) throw r.error; return r.count ?? 0; },
    countIpSince: async (ip, since) => { const r = await admin.from('phone_otps').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', new Date(since).toISOString()); if (r.error) throw r.error; return r.count ?? 0; },
    countPhoneSince: async (phone, since) => { const r = await admin.from('phone_otps').select('id', { count: 'exact', head: true }).eq('phone', phone).gte('created_at', new Date(since).toISOString()); if (r.error) throw r.error; return r.count ?? 0; },
    insertOtp: async (o) => (must(await admin.from('phone_otps').insert({ ...o, expires_at: new Date(o.expires_at).toISOString(), created_at: new Date(o.created_at).toISOString() }).select('id').single()) as { id: string }).id,
    updateOtp: async (id, patch) => { must(await admin.from('phone_otps').update(patch).eq('id', id)); },
    deleteOtp: async (id) => { must(await admin.from('phone_otps').delete().eq('id', id)); },
    claimTry: async (id, expect, patch) => (must(await admin.from('phone_otps').update(patch).eq('id', id).eq('attempts', expect).eq('used', false).select('id')) as unknown[]).length === 1,
    setVerified: async (uid) => { must(await admin.from('profiles').update({ phone_verified: true }).eq('id', uid)); },
    setPassword: async (uid, pw) => { const r = await admin.auth.admin.updateUserById(uid, { password: pw }); if (r.error) throw r.error; },
    sendSms: (phone, text) => sendSmsVia(env('SMS_PROVIDER') ?? '', env, phone, text),
    dailyCap: Number(env('OTP_DAILY_CAP') ?? 300) || 300,
  };
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };

  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'bad_method' }), { status: 405, headers: cors });
    try {
      const body = await req.json().catch(() => ({}));
      const auth = req.headers.get('Authorization') ?? '';
      const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 64) || null;
      const r = await handle(deps, body, jwt, ip);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: cors });
    } catch (e) {
      console.error('phone-otp', e instanceof Error ? e.message : e);
      return new Response(JSON.stringify({ ok: false, error: 'server' }), { status: 500, headers: cors });
    }
  });
}
