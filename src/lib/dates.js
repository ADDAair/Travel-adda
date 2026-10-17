// Dates typed by people: day-month-year in Bengali or English digits.
// Accepts "2027-05-20", "20-05-2027", "20/05/2027" and Bengali digits; returns 'YYYY-MM-DD', '' (empty) or null (wrong).
export function parseDate(s, minYear = 2024) {
  const t = String(s || '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).trim();
  if (!t) return '';
  let y; let mo; let d;
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) { [, y, mo, d] = m; } else { m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); if (!m) return null; [, d, mo, y] = m; }
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d || +y < minYear || +y > 2100) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}


// Today on this phone as 'YYYY-MM-DD'.
export const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Whole days from today to 'YYYY-MM-DD' (negative = already passed).
export const daysUntil = (ymd) => Math.round((Date.parse(`${ymd}T00:00:00`) - Date.parse(`${todayYMD()}T00:00:00`)) / 86400000);
// 'YYYY-MM-DD' -> '২০-০৫-২০২৭' for showing in an input box.
export const ymdToInput = (ymd) => (ymd ? ymd.split('-').reverse().join('-').replace(/\d/g, (x) => '০১২৩৪৫৬৭৮৯'[x]) : '');
