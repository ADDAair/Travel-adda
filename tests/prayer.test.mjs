// Cross-checks src/lib/prayer.js against the independent "adhan" library (installed only in CI).
// Usage: node tests/prayer.test.mjs <path-to-node_modules-containing-adhan>
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-'));
fs.writeFileSync(path.join(tmp, 'phone.mjs'), fs.readFileSync(path.join(root, 'src/lib/phone.js'), 'utf8'));
fs.writeFileSync(path.join(tmp, 'prayer.mjs'), fs.readFileSync(path.join(root, 'src/lib/prayer.js'), 'utf8').replace("from './phone'", "from './phone.mjs'"));
const P = await import(pathToFileURL(path.join(tmp, 'prayer.mjs')).href);
const adhan = createRequire(path.join(process.argv[2] || '.', 'x.js'))('adhan');

const cities = {
  Makkah: [21.4225, 39.8262], Madinah: [24.4672, 39.6111], Mina: [21.4133, 39.8933], Jeddah: [21.5433, 39.1728],
  Riyadh: [24.7136, 46.6753], Dammam: [26.4207, 50.0888], Dhaka: [23.8103, 90.4125], Chattogram: [22.3569, 91.7832],
  Sylhet: [24.8949, 91.8687], Rajshahi: [24.3745, 88.6042], London: [51.5074, -0.1278], KualaLumpur: [3.139, 101.6869],
};
const dates = [];
for (let m = 1; m <= 12; m++) for (const d of [1, 15]) dates.push([2026, m, d]);

let worst = 0; let bad = 0; let n = 0;
for (const [name, [lat, lng]] of Object.entries(cities)) {
  for (const [y, m, d] of dates) {
    const mine = P.prayerTimes({ lat, lng, y, m, d });
    if (mine.ramadan) continue;                       // adhan does not add the Ramadan +30 min to Umm al-Qura Isha
    const params = mine.method.id === 'ummalqura' ? adhan.CalculationMethod.UmmAlQura() : adhan.CalculationMethod.Karachi();
    params.madhab = mine.asrFactor === 2 ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
    if (lat > 48) params.highLatitudeRule = adhan.HighLatitudeRule.SeventhOfTheNight;
    const ref = new adhan.PrayerTimes(new adhan.Coordinates(lat, lng), new Date(Date.UTC(y, m - 1, d, 12)), params);
    for (const k of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
      if (lat > 48 && (k === 'fajr' || k === 'isha')) continue;   // different high-latitude rules by design
      const diff = Math.abs(mine[k] - ref[k].getTime()) / 60000;
      n++; worst = Math.max(worst, diff);
      if (diff > 2) { bad++; console.log(`DIFF ${name} ${y}-${m}-${d} ${k}: mine ${new Date(mine[k]).toISOString()} adhan ${ref[k].toISOString()} (${diff.toFixed(1)} min)`); }
    }
  }
  const q = P.qiblaBearing(lat, lng); const qr = adhan.Qibla(new adhan.Coordinates(lat, lng));
  if (P.distanceKm(lat, lng) > 5 && Math.abs(q - qr) > 0.5)   // at the Kaaba itself the direction is meaningless (app says so) { bad++; console.log(`QIBLA ${name}: ${q} vs ${qr}`); }
}
console.log(`checked ${n} times, worst difference ${worst.toFixed(2)} min, failures ${bad}`);
process.exit(bad ? 1 : 0);
