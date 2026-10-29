// Log in with a mobile number OR a verified e-mail (database step 016).
// The real login address of an account is private (u<random>@users.traveladda.app); the database function login_id()
// gives it for a phone or a verified e-mail, and a made-up one for anything without an account, so the answer never
// tells who uses the app. Before step 016 exists, phone login works the old way and e-mail login says "coming soon".
import { supabase } from './supabase';
import { normalizePhone, isValidBdPhone, phoneToLoginId } from './phone';
import { fail, type DbError } from './rpc';

export const PENDING_EMAIL = 'ta.pendingEmail.v1';          // e-mail typed at sign-up, waiting to be verified
export const looksLikeEmail = (s: unknown): boolean => String(s || '').includes('@');
export const normalizeEmail = (s: unknown): string => String(s || '').trim().toLowerCase();
export const isValidEmail = (e: string): boolean => e.length >= 6 && e.length <= 254 && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e);

const missingFn = (e: DbError | null | undefined): boolean => !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist/i.test(String(e.message || '')));
type LoginIdAnswer = { data: unknown; error: DbError | null };
const loginId = (ident: string): PromiseLike<LoginIdAnswer> => supabase.rpc('login_id', { p_ident: ident }) as unknown as PromiseLike<LoginIdAnswer>;

// Login address for what the person typed. Throws: 'bad-ident', 'email-soon', or the network/server error.
export async function loginEmailFor(typed: unknown): Promise<string> {
  const mail = looksLikeEmail(typed);
  const ident: string = mail ? normalizeEmail(typed) : normalizePhone(typed);
  if (mail ? !isValidEmail(ident) : !isValidBdPhone(ident)) throw fail('bad-ident');
  const r = await loginId(ident);
  if (!r.error && typeof r.data === 'string' && r.data.includes('@')) return r.data;
  if (r.error && missingFn(r.error)) {            // step 016 not run yet: the old way
    if (mail) throw fail('email-soon');
    return phoneToLoginId(ident);
  }
  if (r.error) throw r.error;
  throw fail('bad-ident');
}

// Login address for a NEW account. With step 016: a private random one; before it: the old phone-based one.
export async function newLoginEmail(phone: string): Promise<string> {
  const r = await loginId(phone);
  if (r.error && missingFn(r.error)) return phoneToLoginId(phone);
  if (r.error) throw r.error;
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return `u${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}@users.traveladda.app`;
}

// Is e-mail login/verification available on the server yet (step 016)?
export async function emailReady(): Promise<boolean> {
  const r = await loginId('01300000000');
  return !(r.error && missingFn(r.error));
}

// Common slips in e-mail addresses (gnail.com, gmial.com, gmail.con ...). Returns the corrected address or null.
const FIX: Record<string, string> = {
  'gnail.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmai.com': 'gmail.com', 'gmil.com': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhoo.com': 'yahoo.com',
  'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmial.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com',
};
export function emailTypoFix(e: unknown): string | null {
  const v = normalizeEmail(e); const at = v.lastIndexOf('@');
  if (at < 1) return null;
  const fixed = FIX[v.slice(at + 1)];
  return fixed ? `${v.slice(0, at)}@${fixed}` : null;
}
