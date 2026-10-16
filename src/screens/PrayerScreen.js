import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, ActivityIndicator, Vibration, BackHandler } from 'react-native';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import { CITIES, CITY_GROUPS } from '../content/cities';
import { remindersSupported, remindersOn, enableReminders, disableReminders, refreshReminders } from '../lib/reminders';
import { loadSavedLocation, saveLocation, getGpsLocation, nearLabel, watchHeading } from '../lib/location';
import { ORDER, dayPlan, fmtTime, fmtLeft, fmtDate, qiblaBearing, distanceKm, directionName, inSaudiRegion, isFriday, prayerName, makruhWindows } from '../lib/prayer';
import { SALAH } from '../content/salah';

const GPS_ERR = {
  denied: 'অবস্থানের অনুমতি দেওয়া হয়নি। আবার চাপুন এবং "অনুমতি দিন" বাছুন, অথবা নিচের তালিকা থেকে শহর বেছে নিন।',
  blocked: 'অবস্থানের অনুমতি বন্ধ করা আছে। ফোনের সেটিংসে গিয়ে এই অ্যাপের "Location" চালু করুন, অথবা নিচের তালিকা থেকে শহর বেছে নিন।',
  off: 'ফোনের লোকেশন (GPS) বন্ধ। ওপর থেকে নিচে টেনে "Location" চালু করে আবার চাপুন।',
  nofix: 'অবস্থান পাওয়া যায়নি। খোলা জায়গায় গিয়ে আবার চেষ্টা করুন, অথবা নিচের তালিকা থেকে শহর বেছে নিন।',
};

export default function PrayerScreen({ navigation }) {
  const [loc, setLoc] = useState(undefined);       // undefined = loading, null = not chosen yet
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState('times');
  const [now, setNow] = useState(Date.now());

  useEffect(() => { loadSavedLocation().then(setLoc); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!picking || !loc) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setPicking(false); return true; });
    return () => sub.remove();
  }, [picking, loc]);

  const choose = (l) => { setLoc(l); saveLocation(l).then(() => refreshReminders(l)); setPicking(false); };

  if (loc === undefined) return <View style={st.center}><ActivityIndicator color={C.primary} size="large" /></View>;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান">
        <Text style={st.backT}>‹ হোম</Text>
      </Pressable>
      {!loc || picking ? (
        <LocationPicker hasLoc={!!loc} onChoose={choose} onCancel={() => setPicking(false)} />
      ) : (
        <>
          <View style={st.locRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.locL}>{loc.kind === 'gps' ? '📍 আপনার অবস্থান' : '🏙️ বেছে নেওয়া শহর'}</Text>
              <Text style={st.locT}>{loc.label}</Text>
            </View>
            <Pressable onPress={() => setPicking(true)} style={st.change} accessibilityRole="button" accessibilityLabel="জায়গা বদলান">
              <Text style={st.changeT}>জায়গা বদলান</Text>
            </Pressable>
          </View>
          <Segmented value={mode} onChange={setMode} options={[{ id: 'times', icon: '🕌', label: 'নামাজের সময়' }, { id: 'qibla', icon: '🧭', label: 'কিবলা' }]} />
          {mode === 'times' ? <Times loc={loc} now={now} navigation={navigation} /> : <Qibla loc={loc} />}
        </>
      )}
    </ScrollView>
  );
}

function LocationPicker({ hasLoc, onChoose, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const useGps = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    const r = await getGpsLocation();
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onChoose({ kind: 'gps', lat: r.lat, lng: r.lng, label: nearLabel(r.lat, r.lng), at: Date.now() });
  };
  return (
    <>
      <Text style={st.title} accessibilityRole="header">🕌 নামাজের সময় ও কিবলা</Text>
      <Text style={st.p}>সঠিক সময় দেখাতে আপনি কোথায় আছেন জানা দরকার। দুইভাবে জানাতে পারেন:</Text>
      <Text style={st.h3}>১. ফোনের GPS দিয়ে (সবচেয়ে সঠিক)</Text>
      <Button title={busy ? 'অবস্থান খোঁজা হচ্ছে…' : 'আমার অবস্থান বের করুন'} icon="📍" onPress={useGps} loading={busy} a11yHint="ফোন অবস্থানের অনুমতি চাইবে" />
      <Text style={st.small}>🔒 আপনার অবস্থান শুধু এই ফোনেই থাকে, কোথাও পাঠানো হয় না।</Text>
      {err ? (
        <Notice kind="warn" title={GPS_ERR[err] || GPS_ERR.nofix}>
          {err === 'blocked' ? <Button title="ফোনের সেটিংস খুলুন" icon="⚙️" kind="secondary" onPress={() => Linking.openSettings().catch(() => {})} style={{ marginTop: S.sm }} /> : null}
        </Notice>
      ) : null}
      <Text style={[st.h3, { marginTop: S.lg }]}>২. তালিকা থেকে শহর বেছে নিন</Text>
      {CITY_GROUPS.map((g) => (
        <View key={g.id}>
          <Text style={st.group}>{g.title}</Text>
          <View style={st.grid}>
            {CITIES.filter((c) => c.group === g.id).map((c) => (
              <Pressable key={c.id} onPress={() => onChoose({ kind: 'city', lat: c.lat, lng: c.lng, label: c.name, cityId: c.id })}
                style={({ pressed }) => [st.city, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`${c.name} বেছে নিন`}>
                <Text style={st.cityT}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {hasLoc ? <Button title="বাতিল, আগের জায়গাই থাকুক" kind="secondary" onPress={onCancel} style={{ marginTop: S.md }} /> : null}
    </>
  );
}

function Times({ loc, now, navigation }) {
  let plan;
  try { plan = dayPlan(loc, now); } catch (e) { plan = null; }
  if (!plan) return <Notice kind="bad" title="সময় হিসাব করা যায়নি" text="জায়গা বদলে আবার চেষ্টা করুন।" />;
  const { tz, today, times, next, nextAt } = plan;
  const date = fmtDate(today.y, today.m, today.d);
  const nt = fmtTime(nextAt, tz, next.key);
  const prayers = ORDER.filter((o) => !o.notPrayer);
  const started = prayers.filter((o) => times[o.key] <= now);
  const cur = started.length ? started[started.length - 1] : ORDER[5];
  const between = cur.key === 'fajr' && now >= times.sunrise;   // after sunrise, before Dhuhr
  const saudi = inSaudiRegion(loc.lat, loc.lng);
  const alt = fmtTime(times.asrAlt, tz, 'asr');
  const friday = isFriday(today);
  const nextName = next.key === 'dhuhr' && nextAt === times.dhuhr ? prayerName(next, today) : next.name;
  const openSalah = (section) => navigation.navigate('Salah', { section, from: 'Prayer', t: Date.now() });
  const mk = makruhWindows(times);
  const mkNow = mk.find((w) => now >= w.from && now < w.to);

  return (
    <>
      <Text style={st.date}>{date.greg}</Text>
      <Text style={st.hijri}>{date.hijri} (আনুমানিক)</Text>
      <View style={st.hero} accessible accessibilityLabel={`পরের নামাজ ${nextName}, ${nt.part} ${nt.time}। আর ${fmtLeft(nextAt - now)} বাকি।`}>
        <Text style={st.heroNow}>{between ? 'এখন কোনো ফরজ নামাজের ওয়াক্ত নেই' : `এখন ${cur.gen} ওয়াক্ত চলছে`}</Text>
        <Text style={st.heroL}>পরের নামাজ</Text>
        <Text style={st.heroN}>{next.icon} {nextName}  <Text style={st.heroT}>{nt.time}</Text> <Text style={st.heroP}>{nt.part}</Text></Text>
        <View style={st.leftPill}><Text style={st.leftT}>⏳ আর {fmtLeft(nextAt - now)} বাকি</Text></View>
      </View>
      {mkNow ? <Notice kind="warn" title={`এখন নামাজ পড়ার মাকরুহ সময় (${mkNow.label})`} text={`আর প্রায় ${fmtLeft(mkNow.to - now)} পর নামাজ পড়ুন।`} /> : null}
      {friday ? <Notice kind="info" title="আজ শুক্রবার: জুমার দিন" text="যোহরের ওয়াক্তে জুমার নামাজ। জামাতের সময় মসজিদ ঠিক করে, আগে আগে যান। গোসল, সূরা কাহফ ও বেশি বেশি দরুদ পড়া সুন্নত।">
        <Button title="জুমার নিয়ম ও রাকাত" icon="🕌" kind="secondary" onPress={() => openSalah('jumuah')} style={{ marginTop: S.sm }} />
      </Notice> : null}
      <Text style={st.tapHint}>👇 যেকোনো নামাজে চাপ দিলে তার রাকাত ও নিয়ম দেখাবে।</Text>
      {ORDER.map((o) => {
        const t = fmtTime(times[o.key], tz, o.key);
        const isNext = o.key === next.key && times[o.key] === nextAt;
        const past = times[o.key] <= now && !isNext;
        const name = prayerName(o, today);
        const section = o.key === 'dhuhr' && friday ? 'jumuah' : o.key;
        const info = SALAH.find((x) => x.id === section);
        return (
          <Pressable key={o.key} disabled={o.notPrayer} onPress={() => openSalah(section)}
            style={({ pressed }) => [st.row, isNext && st.rowNext, o.notPrayer && st.rowSun, pressed && { opacity: 0.85 }]}
            accessibilityRole={o.notPrayer ? 'text' : 'button'}
            accessibilityLabel={`${name}${o.notPrayer ? ' (নামাজ নয়, ফজরের শেষ সময়)' : ''}, ${t.part} ${t.time}${isNext ? ', পরের নামাজ' : ''}${info ? `। ${info.what}` : ''}`}
            accessibilityHint={o.notPrayer ? undefined : 'রাকাত ও নিয়ম খুলবে'}>
            <Text style={st.rowIc} importantForAccessibility="no">{o.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[st.rowN, past && { color: C.muted }]}>{name}</Text>
              {o.notPrayer ? <Text style={st.rowSub}>ফজরের সময় শেষ</Text> : null}
              {info ? <Text style={st.rowSub}>{info.what} ›</Text> : null}
              {isNext ? <Text style={st.nextTag}>▶ পরের নামাজ</Text> : null}
            </View>
            <Text style={[st.rowT, past && { color: C.muted }]}>{t.time}</Text>
            <Text style={st.rowP}>{t.part}</Text>
          </Pressable>
        );
      })}
      <Reminders loc={loc} />
      {saudi ? <Notice kind="info" title={`হানাফি মতে আসর শুরু: ${alt.part} ${alt.time}`} text="ওপরের আসরের সময় সৌদি আরবের সরকারি সময় (হারামের আজান)। হারামের জামাতে নামাজ পড়া নিয়ে আপনার আলেমের পরামর্শ মেনে চলুন।" /> : null}
      {times.ramadan && saudi ? <Notice kind="info" title="রমজানে এশা" text="রমজানে মক্কা-মদিনায় এশার আজান মাগরিবের প্রায় দুই ঘণ্টা পরে হয়। ওপরের সময় সেভাবেই হিসাব করা।" /> : null}
      <View style={st.mk}>
        <Text style={st.mkH}>⛔ আজ যে সময় নামাজ পড়া নিষেধ (আনুমানিক)</Text>
        {mk.map((w) => {
          const a = fmtTime(w.from, tz); const b = fmtTime(w.to, tz);
          const on = now >= w.from && now < w.to;
          return (
            <View key={w.key} style={[st.mkRow, on && st.mkOn]} accessible accessibilityLabel={`${w.label}: ${a.part} ${a.time} থেকে ${b.time}${on ? ', এখন চলছে' : ''}`}>
              <Text style={st.mkL}>{w.label}{on ? ' · এখন চলছে' : ''}</Text>
              <Text style={st.mkT}>{a.time} – {b.time} <Text style={st.rowP}>{b.part}</Text></Text>
            </View>
          );
        })}
        <Text style={st.infoT}>এছাড়া ফজরের পর সূর্যোদয় পর্যন্ত এবং আসরের পর সূর্যাস্ত পর্যন্ত নফল নামাজ নয় (কাজা পড়া যায়)। (মুসলিম ৮৩১; বুখারি ৫৮৬)</Text>
      </View>
      <Button title="নামাজের রাকাত ও নিয়ম (সব নামাজ)" icon="📖" kind="secondary" onPress={() => navigation.navigate('Salah', { t: Date.now() })} style={{ marginTop: S.sm }} />
      <View style={st.info}>
        <Text style={st.infoT}>🧮 হিসাবের পদ্ধতি: {times.method.name}।</Text>
        <Text style={st.infoT}>ℹ️ স্থানীয় মসজিদের সময়সূচির সাথে ১-৩ মিনিট পার্থক্য হতে পারে। মসজিদের আজান অনুযায়ী জামাতে শরিক হোন।</Text>
      </View>
    </>
  );
}

const REM_ERR = {
  unsupported: 'এই ফোনে রিমাইন্ডার চালু করা যায় না।',
  denied: 'নোটিফিকেশনের অনুমতি দেওয়া হয়নি। আবার চাপুন এবং "অনুমতি দিন" বাছুন।',
  blocked: 'নোটিফিকেশন বন্ধ করা আছে। ফোনের সেটিংসে গিয়ে এই অ্যাপের নোটিফিকেশন চালু করুন।',
  failed: 'রিমাইন্ডার চালু করা যায়নি। আবার চেষ্টা করুন।',
};
function Reminders({ loc }) {
  const [on, setOn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { remindersOn().then(setOn); }, []);
  if (on === null) return null;
  const turnOn = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    const r = await enableReminders(loc);
    setBusy(false);
    if (r.ok) setOn(true); else setErr(r.error);
  };
  const turnOff = async () => { if (busy) return; setBusy(true); await disableReminders(); setBusy(false); setOn(false); };
  return (
    <View style={[st.rem, on && st.remOn]}>
      <Text style={st.remH}>🔔 নামাজের রিমাইন্ডার: {on ? 'চালু আছে' : 'বন্ধ'}</Text>
      <Text style={st.remT}>{on ? `প্রতি ওয়াক্তের শুরুতে ফোনে নোটিফিকেশন আসবে (${loc.label} অনুযায়ী)। কয়েক মিনিট এদিক-ওদিক হতে পারে।` : 'চালু করলে প্রতি ওয়াক্তের শুরুতে ফোনে নোটিফিকেশন আসবে। ইন্টারনেট লাগবে না।'}</Text>
      {err ? <Notice kind="warn" title={REM_ERR[err] || REM_ERR.failed}>
        {err === 'blocked' ? <Button title="ফোনের সেটিংস খুলুন" icon="⚙️" kind="secondary" onPress={() => Linking.openSettings().catch(() => {})} style={{ marginTop: S.sm }} /> : null}
      </Notice> : null}
      {remindersSupported ? (on
        ? <Button title="রিমাইন্ডার বন্ধ করুন" icon="🔕" kind="secondary" onPress={turnOff} loading={busy} />
        : <Button title="রিমাইন্ডার চালু করুন" icon="🔔" onPress={turnOn} loading={busy} a11yHint="ফোন নোটিফিকেশনের অনুমতি চাইতে পারে" />)
        : <Text style={st.remT}>{REM_ERR.unsupported}</Text>}
    </View>
  );
}

function Qibla({ loc }) {
  const q = qiblaBearing(loc.lat, loc.lng);
  const km = distanceKm(loc.lat, loc.lng);
  const [h, setH] = useState(null);          // { heading, accuracy } or null
  const [state, setState] = useState('start'); // start | on | none
  const wasAligned = useRef(false);

  useEffect(() => {
    let stop = null; let alive = true;
    watchHeading((v) => { if (alive) { setH(v); setState('on'); } }).then((s) => {
      if (!alive) { if (s) s(); return; }
      stop = s;
      if (!s) setState('none');
    });
    const t = setTimeout(() => { if (alive) setState((x) => (x === 'start' ? 'none' : x)); }, 6000);
    return () => { alive = false; clearTimeout(t); if (stop) stop(); };
  }, []);

  const diff = h ? ((q - h.heading + 540) % 360) - 180 : null;   // -180..180, + means turn right
  const aligned = diff !== null && Math.abs(diff) <= 5;
  useEffect(() => {
    if (aligned && !wasAligned.current) Vibration.vibrate(80);
    wasAligned.current = aligned;
  }, [aligned]);

  if (km < 1) {
    return <Notice kind="ok" title="আপনি কাবার একদম কাছে আছেন" text="মসজিদুল হারামে কম্পাসের দরকার নেই। সরাসরি কাবার দিকে মুখ করে নামাজ পড়ুন।" />;
  }
  return (
    <>
      <View style={st.qInfo}>
        <Text style={st.qBig}>{toBn(Math.round(q))}°</Text>
        <Text style={st.p}>উত্তর দিক থেকে ঘড়ির কাঁটার দিকে {toBn(Math.round(q))} ডিগ্রি, মোটামুটি <Text style={{ fontWeight: '700' }}>{directionName(q)}</Text> দিকে। কাবা এখান থেকে প্রায় {toBn(Math.round(km))} কিলোমিটার দূরে।</Text>
      </View>
      {state === 'on' && h ? (
        <>
          <View style={st.dialWrap} accessible accessibilityLiveRegion="polite"
            accessibilityLabel={aligned ? 'আপনি এখন কিবলামুখী' : `${diff > 0 ? 'ডান' : 'বাঁ'} দিকে ${Math.round(Math.abs(diff))} ডিগ্রি ঘুরুন`}>
            <Text style={st.pointer} importantForAccessibility="no">▲</Text>
            <View style={[st.dial, aligned && st.dialOk, { transform: [{ rotate: `${-h.heading}deg` }] }]}>
              {[['উ', 0], ['পূ', 90], ['দ', 180], ['প', 270]].map(([l, a]) => (
                <View key={l} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${a}deg` }] }]}>
                  <Text style={[st.cardinal, l === 'উ' && { color: C.bad }]}>{l}</Text>
                </View>
              ))}
              <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${q}deg` }] }]}>
                <Text style={st.kaaba}>🕋</Text>
                <View style={st.qLine} />
              </View>
            </View>
          </View>
          {aligned ? <Notice kind="ok" title="আপনি এখন কিবলামুখী" text="ফোনের ওপরের দিক যেদিকে, সেদিকে মুখ করে দাঁড়ান।" />
            : <Text style={st.turn}>{diff > 0 ? '↻ ডান দিকে' : '↺ বাঁ দিকে'} আরও {toBn(Math.round(Math.abs(diff)))}° ঘুরুন</Text>}
          {h.accuracy != null && h.accuracy < 2 ? <Notice kind="warn" title="কম্পাস ঠিকমতো কাজ করছে না" text="ফোনটা বাতাসে ইংরেজি 8-এর মতো করে কয়েকবার ঘুরান, তারপর আবার দেখুন।" /> : null}
          <Text style={st.small}>ফোনটা টেবিলের মতো সমান করে ধরুন। লোহা, গাড়ি বা চুম্বক থেকে দূরে থাকুন। 🕋 চিহ্ন ওপরের ▲ বরাবর এলে আপনি কিবলামুখী।</Text>
        </>
      ) : state === 'start' ? (
        <View style={st.center2}><ActivityIndicator color={C.primary} /><Text style={st.small}>কম্পাস চালু হচ্ছে…</Text></View>
      ) : (
        <Notice kind="warn" title="এই ফোনে কম্পাস পাওয়া যায়নি" text={`ওপরের ডিগ্রি দেখে দিক ঠিক করুন, অথবা মসজিদ বা হোটেলে কিবলার চিহ্ন দেখে নিন। ${directionName(q)} দিক।`} />
      )}
      <Text style={st.small}>📚 কিবলার দিক মেনে নামাজ: সূরা বাকারা ২:১৪৪</Text>
    </>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  center2: { alignItems: 'center', gap: S.sm, marginVertical: S.lg },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 36, marginBottom: S.sm },
  p: { fontSize: F.body, color: C.text, lineHeight: 28 },
  h3: { fontSize: F.large, fontWeight: '700', color: C.text, marginTop: S.md, marginBottom: S.sm, lineHeight: 30 },
  small: { fontSize: F.small, color: C.muted, lineHeight: 24, marginTop: S.sm, marginBottom: S.sm },
  group: { fontSize: F.body, fontWeight: '700', color: C.primary, marginTop: S.sm, marginBottom: S.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  city: { flexBasis: '30%', flexGrow: 1, minHeight: 56, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  cityT: { fontSize: F.body, fontWeight: '700', color: C.text, textAlign: 'center' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.md, marginBottom: S.md },
  locL: { fontSize: F.small, color: C.muted },
  locT: { fontSize: F.large, fontWeight: '700', color: C.text, lineHeight: 30 },
  change: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.sm },
  changeT: { fontSize: F.small, fontWeight: '700', color: C.primary, textDecorationLine: 'underline' },
  date: { fontSize: F.body, fontWeight: '700', color: C.text, textAlign: 'center' },
  hijri: { fontSize: F.small, color: C.muted, textAlign: 'center', marginBottom: S.sm },
  hero: { backgroundColor: C.primary, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, alignItems: 'center' },
  heroNow: { color: C.onPrimarySoft, fontSize: F.small, marginBottom: S.xs, textAlign: 'center' },
  heroL: { color: C.onPrimarySoft, fontSize: F.body },
  heroN: { color: C.onPrimary, fontSize: F.hero, fontWeight: '700', marginTop: 2, textAlign: 'center', lineHeight: 40 },
  heroT: { color: C.onPrimary, fontSize: F.hero, fontWeight: '700' },
  heroP: { color: C.onPrimarySoft, fontSize: F.body, fontWeight: '400' },
  leftPill: { backgroundColor: C.accent, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: 6, marginTop: S.sm },
  leftT: { color: C.primary, fontWeight: '700', fontSize: F.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: S.md, paddingVertical: S.sm, minHeight: 64, marginBottom: S.xs },
  rowNext: { borderColor: C.accent, borderWidth: 3, backgroundColor: C.accentSoft },
  rowSun: { backgroundColor: C.bg },
  rowIc: { fontSize: 24 },
  rowN: { fontSize: F.large, fontWeight: '700', color: C.text },
  rowSub: { fontSize: 14, color: C.muted },
  nextTag: { fontSize: 14, fontWeight: '700', color: C.primary },
  rowT: { fontSize: F.large, fontWeight: '700', color: C.text },
  rowP: { fontSize: F.small, color: C.muted, minWidth: 48 },
  tapHint: { fontSize: F.small, color: C.muted, marginBottom: S.xs, lineHeight: 22 },
  mk: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1.5, borderColor: C.bad, padding: S.md, marginTop: S.sm, gap: 6 },
  mkH: { fontSize: F.body, fontWeight: '700', color: C.bad },
  mkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', paddingVertical: 4, paddingHorizontal: 6, borderRadius: R.sm },
  mkOn: { backgroundColor: C.badSoft },
  mkL: { fontSize: F.body, color: C.text },
  mkT: { fontSize: F.body, fontWeight: '700', color: C.text },
  info: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.md, marginTop: S.sm, gap: S.xs },
  infoT: { fontSize: F.small, color: C.text, lineHeight: 24 },
  rem: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, padding: S.md, marginVertical: S.sm },
  remOn: { borderColor: C.ok, backgroundColor: C.okSoft },
  remH: { fontSize: F.body, fontWeight: '700', color: C.text },
  remT: { fontSize: F.small, color: C.text, lineHeight: 24, marginVertical: S.xs },
  qInfo: { backgroundColor: C.card, borderRadius: R.lg, padding: S.md, alignItems: 'center', marginBottom: S.md, ...shadow },
  qBig: { fontSize: 44, fontWeight: '700', color: C.primary },
  dialWrap: { alignItems: 'center', marginVertical: S.md },
  pointer: { fontSize: 28, color: C.accent, marginBottom: -4 },
  dial: { width: 260, height: 260, borderRadius: 130, borderWidth: 6, borderColor: C.primary, backgroundColor: C.card, ...shadow },
  dialOk: { borderColor: C.ok, backgroundColor: C.okSoft },
  cardinal: { position: 'absolute', top: 8, alignSelf: 'center', fontSize: F.large, fontWeight: '700', color: C.primary },
  kaaba: { position: 'absolute', top: 30, alignSelf: 'center', fontSize: 34 },
  qLine: { position: 'absolute', top: 76, bottom: 124, alignSelf: 'center', width: 4, borderRadius: 2, backgroundColor: C.gold },
  turn: { fontSize: F.large, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: S.sm },
});
