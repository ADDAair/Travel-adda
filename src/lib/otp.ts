import { T } from '../strings';
// Phone verification and "forgot password" through the phone-otp server function (supabase/functions/phone-otp).
// Returns { ok: true, ... } or { ok: false, error } — never throws, so screens can always show a clear message.
import { supabase } from './supabase';
import { getLang } from './lang';

export type OtpAnswer = { ok: boolean; error?: string; retry_in?: number; tries_left?: number; [k: string]: unknown };
type FnError = { name?: string; message?: string; context?: { status?: number; json?: () => Promise<unknown> } };

export async function otp(action: string, body: Record<string, unknown> = {}): Promise<OtpAnswer> {
  try {
    const res = await supabase.functions.invoke('phone-otp', { body: { action, lang: getLang(), ...body } });   // lang: e-mail code language
    const data = res.data as unknown; const error = res.error as FnError | null;
    if (!error) return data && typeof data === 'object' ? data as OtpAnswer : { ok: false, error: 'server' };
    // Non-2xx answers still carry our JSON body ({ ok:false, error }).
    const ctx = error.context;
    if (ctx && typeof ctx.json === 'function') {
      const j = await ctx.json().catch(() => null) as OtpAnswer | null;
      if (j && j.error) return j;
      if (ctx.status === 404) return { ok: false, error: 'not_ready' };
    }
    const m = String(error.message || '').toLowerCase();
    if (error.name === 'FunctionsFetchError' || m.includes('fetch') || m.includes('network')) {
      // Is it really the internet, or only the SMS service that is not reachable? Ask the database once.
      const probe: { error: { message?: string } | null } = await supabase.from('app_settings').select('key').limit(1)
        .then((r: { error: { message?: string } | null }) => r, () => ({ error: { message: 'fetch' } }));
      const net = probe.error && /fetch|network|timeout/i.test(String(probe.error.message || ''));
      return { ok: false, error: net ? 'network' : 'not_ready' };
    }
    if (error.name === 'FunctionsRelayError' || m.includes('not found')) return { ok: false, error: 'not_ready' };
    return { ok: false, error: 'server' };
  } catch (e) {
    return { ok: false, error: 'network' };
  }
}

// Plain words (Bengali or English, by the chosen language) for every answer the server can give.
export function otpText(answer: OtpAnswer | null | undefined): string {
  const r: OtpAnswer = answer || { ok: false };
  const O = T.otp;
  switch (r.error) {
    case 'wait': return O.wait(r.retry_in ? Number(r.retry_in) : null);
    case 'wrong_code': return O.wrong_code(r.tries_left != null ? Number(r.tries_left) : null);
    case 'too_many': case 'daily_cap': case 'sms_failed': case 'bad_code': case 'too_many_tries': case 'expired': case 'weak_password':
    case 'bad_email': case 'email_failed': case 'email_taken': case 'bad_phone': case 'not_signed_in': case 'network': case 'not_ready':
      return O[r.error];
    default: return O.other;
  }
}
