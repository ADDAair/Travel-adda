// English step 2 (owner request, Nov 2026): the haji's remaining pages. Each Bengali text gets its English right next
// to it: tr('বাংলা', 'English'), or in a table a row with both `label` and `en`. This test finds any Bengali that has
// no English beside it. A line marked `i18n-ok` holds Bengali the app reads (e.g. words a haji may type), not shows.
// Written first (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tr, setLang } from '../../src/lib/lang.js';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const BENGALI = /[\u0980-\u09F2\u09F4-\u09FF]/;   // the taka sign ৳ (U+09F3) is used in English too
beforeEach(async () => { await setLang('bn'); });

// remove every tr(...) call (its arguments may hold quotes, backticks and ${...}) so only unpaired text is left
export function stripTr(src) {
  let out = ''; let i = 0;
  while (i < src.length) {
    const at = src.indexOf('tr(', i);
    if (at < 0 || /[\w.$]/.test(src[at - 1] || '')) { if (at < 0) { out += src.slice(i); break; } out += src.slice(i, at + 3); i = at + 3; continue; }
    out += src.slice(i, at) + 'tr(…)';
    let j = at + 3; const stack = [')'];
    while (j < src.length && stack.length) {
      const c = src[j]; const top = stack[stack.length - 1];
      if (top === "'" || top === '"') { if (c === '\\') j++; else if (c === top) stack.pop(); }
      else if (top === '`') { if (c === '\\') j++; else if (c === '`') stack.pop(); else if (c === '$' && src[j + 1] === '{') { stack.push('}'); j++; } }
      else if (c === "'" || c === '"' || c === '`') stack.push(c);
      else if (c === '(') stack.push(')'); else if (c === '{') stack.push('}'); else if (c === '[') stack.push(']');
      else if (c === top) stack.pop();
      j++;
    }
    i = j;
  }
  return out;
}
const unpaired = (src) => stripTr(src).split('\n')
  .map((l) => (/^\s*\/\//.test(l) || /i18n-ok/.test(l) ? '' : l.replace(/\s\/\/ .*$/, '')))   // i18n-ok: Bengali the app reads (input words), not shows
  .map((l, n) => [n + 1, l]).filter(([, l]) => BENGALI.test(l) && !/\ben: ['"`]/.test(l));

test('tr() gives the text in the chosen language', async () => {
  assert.equal(tr('হোম', 'Home'), 'হোম');
  await setLang('en'); assert.equal(tr('হোম', 'Home'), 'Home');
});

test('the checker finds Bengali without English and ignores tr(), table rows with en:, and comments', () => {
  assert.equal(unpaired("const a = tr('হোম', 'Home');\nconst b = 'ভুল';\n// বাংলা মন্তব্য\n{ label: 'পাসপোর্ট', en: 'Passport' }").length, 1);
  assert.equal(unpaired('x = tr(`আর ${toBn(n)} দিন`, `${n} days`) + tr("হ্যাঁ (ঠিক)", "Yes (ok)");').length, 0);
});

export const STEP2 = [
  'src/components/VideoBar.tsx', 'src/screens/TripScreen.tsx', 'src/components/TripCard.tsx', 'src/lib/trip.ts', 'src/lib/counts.ts', 'src/lib/docs.ts',
  'src/components/ChatBubbles.tsx', 'src/components/FundCard.tsx', 'src/screens/PhotoCapture.tsx', 'src/screens/Suspended.tsx', 'src/screens/Paused.tsx',
  'src/lib/account.ts', 'src/lib/offerList.ts', 'src/lib/offerRoute.ts', 'src/components/OfferCard.tsx', 'src/screens/OffersScreen.tsx',
  'src/screens/NotificationsScreen.tsx', 'src/screens/Placeholder.tsx', 'src/lib/prayer.ts', 'src/screens/PrayerScreen.tsx',
  'src/screens/DocsScreen.tsx', 'src/screens/GroupScreen.tsx', 'src/screens/EmergencyScreen.tsx', 'src/screens/MyLeaderScreen.tsx',
  'src/screens/LeadersScreen.tsx', 'src/screens/HelpChatScreen.tsx', 'src/screens/ChatConsentScreen.tsx', 'src/screens/TermsScreen.tsx',
  'src/screens/TasbihScreen.tsx', 'src/screens/CalendarScreen.tsx', 'src/screens/FundScreen.tsx', 'src/lib/fund.ts', 'src/lib/market.ts',
  'src/lib/help.ts', 'src/lib/offers.ts', 'src/lib/groups.ts', 'src/components/market.tsx', 'src/components/PaymentBox.tsx',
  'src/components/DistrictPicker.tsx', 'src/components/guide.tsx',
];

test('step 2 files: every Bengali text has its English next to it', () => {
  const bad = [];
  for (const f of STEP2) for (const [n, l] of unpaired(read(f))) bad.push(`${f}:${n}: ${l.trim().slice(0, 120)}`);
  assert.deepEqual(bad, []);
});

test('place names on the prayer page follow the language (also for a place saved before English existed)', async () => {
  const { placeName } = await import('../../src/lib/location.js');
  const city = { kind: 'city', lat: 21.4225, lng: 39.8262, label: 'মক্কা', cityId: 'makkah' };
  const gps = { kind: 'gps', lat: 21.43, lng: 39.83, label: 'মক্কার কাছে' };
  const far = { kind: 'gps', lat: 0, lng: 0, label: 'আপনার বর্তমান অবস্থান' };
  assert.equal(placeName(city), 'মক্কা'); assert.equal(placeName(gps), 'মক্কার কাছে');
  await setLang('en');
  assert.equal(placeName(city), 'Makkah'); assert.equal(placeName(gps), 'Near Makkah'); assert.equal(placeName(far), 'Your current location');
  assert.equal(placeName(null), '');
  const s = read('src/screens/PrayerScreen.tsx');
  assert.ok(!s.includes('{loc.label}') && !s.includes('${loc.label}'), 'the page never shows the saved (Bengali) label');
});

test('hadith and Quran references read in English too (book names and digits)', async () => {
  const { refText } = await import('../../src/lib/lang.js');
  assert.equal(refText('মুসলিম ১১৬২, ১১৩৪'), 'মুসলিম ১১৬২, ১১৩৪');
  await setLang('en');
  assert.equal(refText('মুসলিম ১১৬২, ১১৩৪'), 'Muslim 1162, 1134');
  assert.equal(refText('সূরা বাকারা ২:১৮৫'), 'Surah al-Baqarah 2:185');
  assert.equal(refText('আবু দাউদ ৫০৯৫, তিরমিযি ৩৪২৬; বুখারি ৯৬৯'), 'Abu Dawud 5095, Tirmidhi 3426; Bukhari 969');
  assert.equal(refText('তিরমিজি ১৪৯; ইবনে মাজাহ ৩০৩৮; নাসায়ি ৩০৫৭'), 'Tirmidhi 149; Ibn Majah 3038; Nasa\'i 3057');
  assert.equal(refText(''), '');
});

test('district names: the saved value stays Bengali, the name shown follows the language; search works in both', async () => {
  const { DISTRICTS, DISTRICTS_EN, districtName, districtMatch } = await import('../../src/lib/market.js');
  assert.equal(DISTRICTS.length, 64); assert.equal(DISTRICTS_EN.length, 64);
  assert.equal(new Set(DISTRICTS_EN).size, 64);
  assert.equal(districtName('সিলেট'), 'সিলেট');
  await setLang('en');
  assert.equal(districtName('সিলেট'), 'Sylhet'); assert.equal(districtName('কক্সবাজার'), "Cox's Bazar");
  assert.equal(districtName('নতুন জায়গা'), 'নতুন জায়গা', 'a typed name (not in the list) is shown as typed');
  assert.ok(districtMatch('সিলেট', 'syl') && districtMatch('সিলেট', 'সিল') && !districtMatch('ঢাকা', 'syl'));
  const p = read('src/components/DistrictPicker.tsx');
  assert.ok(p.includes('districtName(') && p.includes('districtMatch('), 'the picker shows and searches both');
});
