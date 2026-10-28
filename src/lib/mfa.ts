// Admin & staff 2FA with an authenticator app (Google Authenticator / Microsoft Authenticator).
// The database (supabase/023_admin_mfa.sql) refuses every admin / staff action until the session passed 2FA;
// this file only drives the screens that let the admin set it up and type the 6-digit code.
import { supabase } from './supabase';
import { normalizeDigits } from './phone';
import { check, fail, type DbError, type DbResult } from './rpc';

type Factor = { id: string; factor_type: string; status: string };
type MfaApi = {
  getAuthenticatorAssuranceLevel: () => PromiseLike<DbResult<{ currentLevel: string | null; nextLevel: string | null }>>;
  listFactors: () => PromiseLike<DbResult<{ all?: Factor[] }>>;
  unenroll: (a: { factorId: string }) => PromiseLike<DbResult<unknown>>;
  enroll: (a: { factorType: 'totp'; friendlyName: string }) => PromiseLike<DbResult<{ id: string; totp: { secret: string; uri: string } }>>;
  challenge: (a: { factorId: string }) => PromiseLike<DbResult<{ id: string }>>;
  verify: (a: { factorId: string; challengeId: string; code: string }) => PromiseLike<DbResult<unknown>>;
};
const mfa = (): MfaApi => (supabase as unknown as { auth: { mfa: MfaApi } }).auth.mfa;
const totps = (d: { all?: Factor[] } | null): Factor[] => ((d && d.all) || []).filter((f) => f.factor_type === 'totp');

export type MfaStep = { step: 'ok' } | { step: 'verify'; factorId: string } | { step: 'enroll' };

// again: true = ask for the code even if this session already passed 2FA (after the admin panel locked itself).
export async function mfaStep({ again = false }: { again?: boolean } = {}): Promise<MfaStep> {
  const a = check(await mfa().getAuthenticatorAssuranceLevel());
  if (a && a.currentLevel === 'aal2' && !again) return { step: 'ok' };
  const done = totps(check(await mfa().listFactors())).find((f) => f.status === 'verified');
  return done ? { step: 'verify', factorId: done.id } : { step: 'enroll' };
}

export type Enrollment = { factorId: string; secret: string; uri: string };

// Removes only half-finished (unverified) attempts — never a working authenticator — then starts a new one.
export async function startEnroll(): Promise<Enrollment> {
  const old = totps(check(await mfa().listFactors())).filter((f) => f.status !== 'verified');
  for (const f of old) await mfa().unenroll({ factorId: f.id });
  const d = check(await mfa().enroll({ factorType: 'totp', friendlyName: 'Travel Adda' }));
  if (!d) throw fail('enroll');
  return { factorId: d.id, secret: d.totp.secret, uri: d.totp.uri };
}

export function cleanCode(v: unknown): string | null {
  const t = normalizeDigits(String(v ?? '')).replace(/\s/g, '');
  return /^\d{6}$/.test(t) ? t : null;
}

const isNetwork = (e: DbError): boolean => /network|fetch/i.test(String(e.message || ''));

export async function verifyCode(factorId: string, code: unknown): Promise<true> {
  const c = cleanCode(code);
  if (!c) throw fail('format');
  const ch = check(await mfa().challenge({ factorId }));
  if (!ch) throw fail('wrong');
  const r = await mfa().verify({ factorId, challengeId: ch.id, code: c });
  if (r.error) {
    if (r.error.status === 429 || isNetwork(r.error)) throw r.error;
    throw fail('wrong');
  }
  return true;
}

export function mfaErrorText(e: (DbError & { code?: string }) | null | undefined): string {
  if (!e) return '';
  if (e.code === 'format') return 'অথেনটিকেটর অ্যাপে দেখানো ৬ সংখ্যার কোডটি লিখুন।';
  if (e.code === 'wrong') return 'কোডটি ভুল বা মেয়াদ শেষ। অ্যাপে এখন যে কোড দেখাচ্ছে, সেটি লিখুন।';
  if (e.status === 429) return 'অনেকবার চেষ্টা হয়েছে। কয়েক মিনিট অপেক্ষা করে আবার চেষ্টা করুন।';
  if (isNetwork(e)) return 'ইন্টারনেট সংযোগ নেই। সংযোগ দেখে আবার চেষ্টা করুন।';
  return 'কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।';
}

export const secretGroups = (s: unknown): string => (String(s || '').match(/.{1,4}/g) || []).join(' ');
