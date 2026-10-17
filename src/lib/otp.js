// Phone verification and "forgot password" through the phone-otp server function (supabase/functions/phone-otp).
// Returns { ok: true, ... } or { ok: false, error } — never throws, so screens can always show a clear message.
import { supabase } from './supabase';

export async function otp(action, body = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('phone-otp', { body: { action, ...body } });
    if (!error) return data && typeof data === 'object' ? data : { ok: false, error: 'server' };
    // Non-2xx answers still carry our JSON body ({ ok:false, error }).
    const ctx = error.context;
    if (ctx && typeof ctx.json === 'function') {
      const j = await ctx.json().catch(() => null);
      if (j && j.error) return j;
      if (ctx.status === 404) return { ok: false, error: 'not_ready' };
    }
    const m = String(error.message || '').toLowerCase();
    if (error.name === 'FunctionsFetchError' || m.includes('fetch') || m.includes('network')) {
      // Is it really the internet, or only the SMS service that is not reachable? Ask the database once.
      const probe = await supabase.from('app_settings').select('key').limit(1).then((r) => r, () => ({ error: { message: 'fetch' } }));
      const net = probe.error && /fetch|network|timeout/i.test(String(probe.error.message || ''));
      return { ok: false, error: net ? 'network' : 'not_ready' };
    }
    if (error.name === 'FunctionsRelayError' || m.includes('not found')) return { ok: false, error: 'not_ready' };
    return { ok: false, error: 'server' };
  } catch (e) {
    return { ok: false, error: 'network' };
  }
}

// Plain Bengali for every answer the server can give.
export function otpText(r) {
  switch (r && r.error) {
    case 'wait': return `একটু অপেক্ষা করুন। ${r.retry_in ? `${String(r.retry_in).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d])} সেকেন্ড` : '১ মিনিট'} পরে আবার কোড চাইতে পারবেন।`;
    case 'too_many': return 'অনেকবার কোড চাওয়া হয়েছে। ১ ঘণ্টা পরে আবার চেষ্টা করুন।';
    case 'daily_cap': return 'আজ আর কোড পাঠানো যাচ্ছে না। কাল আবার চেষ্টা করুন, অথবা হেল্পলাইনে যোগাযোগ করুন।';
    case 'sms_failed': return 'এসএমএস পাঠানো যায়নি। একটু পরে আবার চেষ্টা করুন।';
    case 'bad_code': return 'কোডটি ৬ সংখ্যার। এসএমএস দেখে ঠিকমতো লিখুন।';
    case 'wrong_code': return `কোড মেলেনি।${r.tries_left != null ? ` আর ${String(r.tries_left).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d])} বার চেষ্টা করতে পারবেন।` : ''}`;
    case 'too_many_tries': return 'অনেকবার ভুল কোড দেওয়া হয়েছে। নতুন কোড চান।';
    case 'expired': return 'কোডের মেয়াদ শেষ বা কোডটি আর কাজ করছে না। নতুন কোড চান।';
    case 'weak_password': return 'পাসওয়ার্ড অন্তত ৮ অক্ষরের দিন, সহজে আন্দাজ করা যায় এমন নয়।';
    case 'bad_phone': return 'সঠিক ১১ সংখ্যার মোবাইল নম্বর লিখুন (০১ দিয়ে শুরু)।';
    case 'not_signed_in': return 'আবার লগইন করে চেষ্টা করুন।';
    case 'network': return 'ইন্টারনেট সংযোগ নেই বা দুর্বল। সংযোগ দেখে আবার চেষ্টা করুন।';
    case 'not_ready': return 'এসএমএস কোড পাঠানোর সুবিধা এখন পাওয়া যাচ্ছে না (শীঘ্রই চালু হবে)। পরে আবার চেষ্টা করুন, অথবা হেল্পলাইনে যোগাযোগ করুন।';
    default: return 'কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।';
  }
}
