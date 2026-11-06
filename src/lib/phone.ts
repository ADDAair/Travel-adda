import { getLang } from './lang';
const BN = '০১২৩৪৫৬৭৮৯';   // i18n-ok: digits
// Accepts Bengali or English digits; returns normalized English-digit string.
export function normalizeDigits(s: unknown): string {
  return String(s || '').replace(/[০-৯]/g, (d) => String(BN.indexOf(d))).replace(/\s|-/g, '');
}
export function normalizePhone(s: unknown): string {
  let p = normalizeDigits(s);
  if (p.startsWith('+880')) p = '0' + p.slice(4);
  else if (p.startsWith('880')) p = '0' + p.slice(3);
  return p;
}
export const isValidBdPhone = (p: string): boolean => /^01[3-9][0-9]{8}$/.test(p);
export const phoneToLoginId = (p: string): string => p + '@users.traveladda.app';
// Digits for display: Bengali digits in Bengali, normal digits in English (the name stays for the many callers).
export const toBn = (s: unknown): string => (getLang() === 'en' ? String(s) : String(s).replace(/\d/g, (d) => BN[Number(d)]));
