const BN = '০১২৩৪৫৬৭৮৯';
// Accepts Bengali or English digits; returns normalized English-digit string.
export function normalizeDigits(s) {
  return String(s || '').replace(/[০-৯]/g, (d) => String(BN.indexOf(d))).replace(/\s|-/g, '');
}
export function normalizePhone(s) {
  let p = normalizeDigits(s);
  if (p.startsWith('+880')) p = '0' + p.slice(4);
  else if (p.startsWith('880')) p = '0' + p.slice(3);
  return p;
}
export const isValidBdPhone = (p) => /^01[3-9][0-9]{8}$/.test(p);
export const phoneToLoginId = (p) => p + '@users.traveladda.app';
export const toBn = (s) => String(s).replace(/\d/g, (d) => BN[d]);
