// Admin & staff 2FA with an authenticator app (Google Authenticator / Microsoft Authenticator).
// The database (supabase/023_admin_mfa.sql) refuses every admin / staff action until the session passed 2FA;
// this file only drives the screens that let the admin set it up and type the 6-digit code.
import { supabase } from './supabase';
import { normalizeDigits } from './phone';

const mfa = () => supabase.auth.mfa;
const check = (r) => { if (r.error) throw r.error; return r.data; };
const totps = (d) => ((d && d.all) || []).filter((f) => f.factor_type === 'totp');

// { step: 'ok' } | { step: 'verify', factorId } | { step: 'enroll' }
export async function mfaStep() {
  const a = check(await mfa().getAuthenticatorAssuranceLevel());
  if (a && a.currentLevel === 'aal2') return { step: 'ok' };
  const done = totps(check(await mfa().listFactors())).find((f) => f.status === 'verified');
  return done ? { step: 'verify', factorId: done.id } : { step: 'enroll' };
}

// Removes only half-finished (unverified) attempts — never a working authenticator — then starts a new one.
export async function startEnroll() {
  const old = totps(check(await mfa().listFactors())).filter((f) => f.status !== 'verified');
  for (const f of old) await mfa().unenroll({ factorId: f.id });
  const d = check(await mfa().enroll({ factorType: 'totp', friendlyName: 'Travel Adda' }));
  return { factorId: d.id, secret: d.totp.secret, uri: d.totp.uri };
}

export function cleanCode(v) {
  const t = normalizeDigits(String(v ?? '')).replace(/\s/g, '');
  return /^\d{6}$/.test(t) ? t : null;
}

export async function verifyCode(factorId, code) {
  const c = cleanCode(code);
  if (!c) throw Object.assign(new Error('format'), { code: 'format' });
  const ch = check(await mfa().challenge({ factorId }));
  const r = await mfa().verify({ factorId, challengeId: ch.id, code: c });
  if (r.error) {
    const e = r.error;
    if (e.status === 429) throw e;
    if (/network|fetch/i.test(String(e.message || ''))) throw e;
    throw Object.assign(new Error('wrong'), { code: 'wrong' });
  }
  return true;
}

export function mfaErrorText(e) {
  if (!e) return '';
  if (e.code === 'format') return 'অথেনটিকেটর অ্যাপে দেখানো ৬ সংখ্যার কোডটি লিখুন।';
  if (e.code === 'wrong') return 'কোডটি ভুল বা মেয়াদ শেষ। অ্যাপে এখন যে কোড দেখাচ্ছে, সেটি লিখুন।';
  if (e.status === 429) return 'অনেকবার চেষ্টা হয়েছে। কয়েক মিনিট অপেক্ষা করে আবার চেষ্টা করুন।';
  if (/network|fetch/i.test(String(e.message || ''))) return 'ইন্টারনেট সংযোগ নেই। সংযোগ দেখে আবার চেষ্টা করুন।';
  return 'কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।';
}

export const secretGroups = (s) => (String(s || '').match(/.{1,4}/g) || []).join(' ');
