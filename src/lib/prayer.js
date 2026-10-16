// Prayer times, qibla direction and Hijri month, calculated on the phone (no internet, location never leaves the device).
// Astronomy follows the well-known PrayTimes.org method; results are checked in CI against the "adhan" library
// (tests/prayer.test.mjs). Times can differ from a local mosque timetable by 1-3 minutes (precaution minutes).
import { toBn } from './phone';

const KAABA = { lat: 21.422487, lng: 39.826206 };
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const dsin = (d) => Math.sin(rad(d));
const dcos = (d) => Math.cos(rad(d));
const dtan = (d) => Math.tan(rad(d));
const darcsin = (x) => deg(Math.asin(x));
const darccos = (x) => deg(Math.acos(x));
const darctan2 = (y, x) => deg(Math.atan2(y, x));
const darccot = (x) => deg(Math.atan(1 / x));
const fix = (a, b) => { const r = a - b * Math.floor(a / b); return r < 0 ? r + b : r; };
const fixAngle = (a) => fix(a, 360);
const fixHour = (a) => fix(a, 24);

function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * dsin(g) + 0.02 * dsin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = darctan2(dcos(e) * dsin(L), dcos(L)) / 15;
  return { decl: darcsin(dsin(e) * dsin(L)), eqt: q / 15 - fixHour(RA) };
}

// Calculation methods. Saudi Arabia: Umm al-Qura (official). Elsewhere: University of Islamic Sciences, Karachi,
// which Islamic Foundation Bangladesh uses, with Hanafi Asr.
export const METHODS = {
  ummalqura: { id: 'ummalqura', name: 'উম্মুল কুরা (সৌদি আরবের সরকারি পদ্ধতি)', fajr: 18.5, ishaMin: 90, asr: 1 },
  karachi: { id: 'karachi', name: 'করাচি পদ্ধতি, হানাফি আসর (ইসলামিক ফাউন্ডেশন বাংলাদেশ যেভাবে হিসাব করে)', fajr: 18, isha: 18, asr: 2 },
};

// Saudi Arabia and the nearby +3 hour area (Kuwait, Bahrain, Yemen, south Iraq, Jordan) - rough box, excludes UAE/Qatar.
export const inSaudiRegion = (lat, lng) => lat >= 16 && lat <= 32.5 && lng >= 34.5 && lng <= 50.8;
export const inBangladesh = (lat, lng) => lat >= 20.5 && lat <= 26.7 && lng >= 88 && lng <= 92.7;
export const methodFor = (lat, lng) => (inSaudiRegion(lat, lng) ? METHODS.ummalqura : METHODS.karachi);

// Minutes ahead of UTC used to show times. Known regions use their fixed zone, so a phone whose clock zone was not
// updated after travelling still shows Makkah times in Makkah. Elsewhere the phone's own zone is used.
export function tzFor(lat, lng, deviceOffsetMin) {
  if (inSaudiRegion(lat, lng)) return 180;
  if (inBangladesh(lat, lng)) return 360;
  return deviceOffsetMin;
}

// Calendar date (y, m, d) at the location for a moment in time.
export function localYMD(ms, tzMin) {
  const t = new Date(ms + tzMin * 60000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// Tabular Islamic calendar (can differ by one day from the announced moon sighting).
export function hijri(y, m, d) {
  const jd = Math.floor(julian(y, m, d) + 0.5);
  const l0 = jd - 1948440 + 10632;
  const n = Math.floor((l0 - 1) / 10631);
  let l = l0 - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hm = Math.floor((24 * l) / 709);
  return { y: 30 * n + j - 30, m: hm, d: l - Math.floor((709 * hm) / 24) };
}

/**
 * Prayer times for one day at one place. Returns UTC milliseconds.
 * Start times are rounded UP to the minute and sunrise DOWN, so the app never shows a prayer as started too early
 * or Fajr as lasting too long.
 */
export function prayerTimes({ lat, lng, y, m, d, method, asrFactor }) {
  const M = method || methodFor(lat, lng);
  const asrF = asrFactor || M.asr;
  const jDate = julian(y, m, d) - lng / (15 * 24);
  const pos = (t) => sunPosition(jDate + t / 24);
  const midDay = (t) => fixHour(12 - pos(t).eqt);
  const angleTime = (angle, t, ccw) => {
    const decl = pos(t).decl;
    const v = (-dsin(angle) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat));
    const T = darccos(v) / 15;
    return midDay(t) + (ccw ? -T : T);
  };
  const asrTime = (f, t) => {
    const decl = pos(t).decl;
    return angleTime(-darccot(f + dtan(Math.abs(lat - decl))), t);
  };

  // two passes: first with rough guesses, then refined with the results
  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, asrAlt: 13, sunset: 18, isha: 18 };
  for (let k = 0; k < 2; k++) {
    t = {
      fajr: angleTime(M.fajr, t.fajr, true),
      sunrise: angleTime(0.833, t.sunrise, true),
      dhuhr: midDay(t.dhuhr),
      asr: asrTime(asrF, t.asr),
      asrAlt: asrTime(asrF === 1 ? 2 : 1, t.asrAlt),
      sunset: angleTime(0.833, t.sunset),
      isha: M.isha ? angleTime(M.isha, t.isha) : t.isha,
    };
  }
  // Far north/south where the sun does not go deep enough: use the "angle / 60 of the night" rule.
  const night = 24 - (t.sunset - t.sunrise);
  if (!Number.isFinite(t.fajr)) t.fajr = t.sunrise - (M.fajr / 60) * night;
  const h = hijri(y, m, d);
  if (M.ishaMin) t.isha = t.sunset + (M.ishaMin + (h.m === 9 ? 30 : 0)) / 60;
  else if (!Number.isFinite(t.isha)) t.isha = t.sunset + (M.isha / 60) * night;

  const base = Date.UTC(y, m - 1, d);
  const toMs = (hours, up) => {
    const ms = base + (hours - lng / 15) * 3600000;
    return (up ? Math.ceil(ms / 60000) : Math.floor(ms / 60000)) * 60000;
  };
  return {
    fajr: toMs(t.fajr, true), sunrise: toMs(t.sunrise, false), dhuhr: toMs(t.dhuhr, true),
    asr: toMs(t.asr, true), asrAlt: toMs(t.asrAlt, true), maghrib: toMs(t.sunset, true), isha: toMs(t.isha, true),
    method: M, asrFactor: asrF, ramadan: h.m === 9,
  };
}

// Direction of the Kaaba in degrees clockwise from true north.
export function qiblaBearing(lat, lng) {
  const dL = rad(KAABA.lng - lng);
  const b = Math.atan2(Math.sin(dL), Math.cos(rad(lat)) * Math.tan(rad(KAABA.lat)) - Math.sin(rad(lat)) * Math.cos(dL));
  return fixAngle(deg(b));
}

export function distanceKm(lat1, lng1, lat2 = KAABA.lat, lng2 = KAABA.lng) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DIRS = ['উত্তর', 'উত্তর-পূর্ব', 'পূর্ব', 'দক্ষিণ-পূর্ব', 'দক্ষিণ', 'দক্ষিণ-পশ্চিম', 'পশ্চিম', 'উত্তর-পশ্চিম'];
export const directionName = (b) => DIRS[Math.round(fixAngle(b) / 45) % 8];

// "৫:১২" and a Bengali part-of-day word, shown in the location's own time. With a prayer key the word follows the
// prayer (Isha is always "রাত", Maghrib "সন্ধ্যা"), so it never looks odd in long summer evenings.
const PART = { fajr: 'ভোর', sunrise: 'সকাল', dhuhr: 'দুপুর', asr: 'বিকাল', maghrib: 'সন্ধ্যা', isha: 'রাত' };
export function fmtTime(ms, tzMin, key) {
  const t = new Date(ms + tzMin * 60000);
  const H = t.getUTCHours();
  const mi = t.getUTCMinutes();
  const mins = H * 60 + mi;
  const part = mins < 240 ? 'রাত' : mins < 360 ? 'ভোর' : mins < 720 ? 'সকাল' : mins < 900 ? 'দুপুর' : mins < 1050 ? 'বিকাল' : mins < 1140 ? 'সন্ধ্যা' : 'রাত';
  const h12 = H % 12 === 0 ? 12 : H % 12;
  return { time: toBn(`${h12}:${String(mi).padStart(2, '0')}`), part: PART[key] || part };
}

// "১ ঘণ্টা ৫ মিনিট"
export function fmtLeft(ms) {
  const total = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(total / 60);
  const mi = total % 60;
  if (h === 0) return `${toBn(mi)} মিনিট`;
  return mi === 0 ? `${toBn(h)} ঘণ্টা` : `${toBn(h)} ঘণ্টা ${toBn(mi)} মিনিট`;
}

const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const BN_DAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const HIJRI_MONTHS = ['মুহাররম', 'সফর', 'রবিউল আউয়াল', 'রবিউস সানি', 'জমাদিউল আউয়াল', 'জমাদিউস সানি', 'রজব', 'শাবান', 'রমজান', 'শাওয়াল', 'জিলকদ', 'জিলহজ'];
export function fmtDate(y, m, d) {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const h = hijri(y, m, d);
  return { greg: `${BN_DAYS[wd]}, ${toBn(d)} ${BN_MONTHS[m - 1]} ${toBn(y)}`, hijri: `${toBn(h.d)} ${HIJRI_MONTHS[h.m - 1]} ${toBn(h.y)} হিজরি` };
}

// Today's list plus which prayer is next. After Isha the next prayer is tomorrow's Fajr.
export const ORDER = [
  { key: 'fajr', name: 'ফজর', gen: 'ফজরের', icon: '🌄' },
  { key: 'sunrise', name: 'সূর্যোদয়', gen: 'সূর্যোদয়ের', icon: '🌅', notPrayer: true },
  { key: 'dhuhr', name: 'যোহর', gen: 'যোহরের', icon: '☀️' },
  { key: 'asr', name: 'আসর', gen: 'আসরের', icon: '🌤️' },
  { key: 'maghrib', name: 'মাগরিব', gen: 'মাগরিবের', icon: '🌇' },
  { key: 'isha', name: 'এশা', gen: 'এশার', icon: '🌙' },
];
export function dayPlan(loc, nowMs) {
  const tz = tzFor(loc.lat, loc.lng, loc.deviceTz != null ? loc.deviceTz : -new Date(nowMs).getTimezoneOffset());
  const today = localYMD(nowMs, tz);
  const times = prayerTimes({ lat: loc.lat, lng: loc.lng, ...today });
  let next = ORDER.find((o) => !o.notPrayer && times[o.key] > nowMs);
  let nextAt = next ? times[next.key] : null;
  if (!next) {
    const tm = localYMD(nowMs + 24 * 3600000, tz);
    next = ORDER[0];
    nextAt = prayerTimes({ lat: loc.lat, lng: loc.lng, ...tm }).fajr;
  }
  return { tz, today, times, next, nextAt };
}
