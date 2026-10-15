// Password strength for the sign-up form. Shown with a bar AND a word, never colour alone.
// level 0 = not allowed (too short or too easy to guess), 1 = medium (allowed), 2 = strong.
const SEQ = '01234567890123456789';
const SEQ_R = '98765432109876543210';
export function passwordStrength(pw, phone = '') {
  const p = String(pw || '');
  const checks = {
    length: p.length >= 8,
    mixed: /[0-9]/.test(p) && /[^0-9]/.test(p),
    long: p.length >= 12 || /[^A-Za-z0-9]/.test(p),
  };
  const digitsOnly = /^[0-9]+$/.test(p);
  const sameChar = /^(.)\1+$/.test(p);
  const sequence = digitsOnly && (SEQ.includes(p) || SEQ_R.includes(p));
  const isPhone = phone && p.replace(/\D/g, '') === String(phone).replace(/\D/g, '') && p.length >= 8;
  const common = ['password', 'password1', '12345678', 'qwerty123', 'abc12345', 'bangladesh', 'allah123'].includes(p.toLowerCase());
  const tooEasy = sameChar || sequence || isPhone || common;
  let level = 0;
  if (checks.length && !tooEasy) level = checks.mixed && checks.long ? 2 : 1;
  return { level, checks, tooEasy };
}
export const STRENGTH_LABEL = ['দুর্বল', 'মাঝারি', 'শক্তিশালী'];
