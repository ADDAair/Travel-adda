import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, ActivityIndicator, Vibration, BackHandler, Platform } from 'react-native';
import { tr, getLang } from '../lib/lang';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import { CITIES, CITY_GROUPS } from '../content/cities';
import { remindersSupported, remindersOn, enableReminders, disableReminders, refreshReminders, getAlarms, setAlarm } from '../lib/reminders';
import { loadSavedLocation, saveLocation, getGpsLocation, nearLabel, placeName, watchHeading, type Place } from '../lib/location';
import { smoothHeading, qiblaTurn, compassWeak } from '../lib/qibla';
import { ORDER, dayPlan, fmtTime, fmtLeft, fmtDate, qiblaBearing, distanceKm, directionName, inSaudiRegion, isFriday, prayerName, makruhWindows } from '../lib/prayer';
import { salahL } from '../content/salah';
import type { Nav } from './navTypes';

const GPS_ERR: Record<string, string> = {
  get denied() { return tr('অবস্থানের অনুমতি দেওয়া হয়নি। আবার চাপুন এবং "অনুমতি দিন" বাছুন, অথবা নিচের তালিকা থেকে শহর বেছে নিন।', 'Location permission was not given. Tap again and choose "Allow", or pick a city from the list below.'); },
  get blocked() { return tr('অবস্থানের অনুমতি বন্ধ করা আছে। ফোনের সেটিংসে গিয়ে এই অ্যাপের "Location" চালু করুন, অথবা নিচের তালিকা থেকে শহর বেছে নিন।', 'Location permission is off. Turn on "Location" for this app in the phone settings, or pick a city from the list below.'); },
  get off() { return tr('ফোনের লোকেশন (GPS) বন্ধ। ওপর থেকে নিচে টেনে "Location" চালু করে আবার চাপুন।', 'The phone location (GPS) is off. Swipe down from the top, turn on "Location" and tap again.'); },
  get nofix() { return tr('অবস্থান পাওয়া যায়নি। খোলা জায়গায় গিয়ে আবার চেষ্টা করুন, অথবা নিচের তালিকা থেকে শহর বেছে নিন।', 'Your location was not found. Go to an open place and try again, or pick a city from the list below.'); },
};

export default function PrayerScreen({ navigation }: { navigation: Nav }) {
  const [loc, setLoc] = useState<Place | null | undefined>(undefined);       // undefined = loading, null = not chosen yet
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

  const choose = (l: Place) => { setLoc(l); saveLocation(l).then(() => refreshReminders(l)); setPicking(false); };

  if (loc === undefined) return <View style={st.center}><ActivityIndicator color={C.primary} size="large" /></View>;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}>
        <Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text>
      </Pressable>
      {!loc || picking ? (
        <LocationPicker hasLoc={!!loc} onChoose={choose} onCancel={() => setPicking(false)} />
      ) : (
        <>
          <View style={st.locRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.locL}>{loc.kind === 'gps' ? tr('📍 আপনার অবস্থান', '📍 Your location') : tr('🏙️ বেছে নেওয়া শহর', '🏙️ Chosen city')}</Text>
              <Text style={st.locT}>{placeName(loc)}</Text>
            </View>
            <Pressable onPress={() => setPicking(true)} style={st.change} accessibilityRole="button" accessibilityLabel={tr('জায়গা বদলান', 'Change place')}>
              <Text style={st.changeT}>{tr('জায়গা বদলান', 'Change place')}</Text>
            </Pressable>
          </View>
          <Segmented value={mode} onChange={setMode} options={[{ id: 'times', icon: '🕌', label: tr('নামাজের সময়', 'Prayer times') }, { id: 'qibla', icon: '🧭', label: tr('কিবলা', 'Qibla') }]} />
          {mode === 'times' ? <Times loc={loc} now={now} navigation={navigation} /> : <Qibla loc={loc} />}
        </>
      )}
    </ScrollView>
  );
}

function LocationPicker({ hasLoc, onChoose, onCancel }: { hasLoc: boolean; onChoose: (l: Place) => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const useGps = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    const r = await getGpsLocation();   // { lat, lng } or { error }
    setBusy(false);
    if ('error' in r) { setErr(r.error); return; }
    onChoose({ kind: 'gps', lat: r.lat, lng: r.lng, label: nearLabel(r.lat, r.lng), at: Date.now() });
  };
  return (
    <>
      <Text style={st.title} accessibilityRole="header">{tr('🕌 নামাজের সময় ও কিবলা', '🕌 Prayer times and Qibla')}</Text>
      <Text style={st.p}>{tr('সঠিক সময় দেখাতে আপনি কোথায় আছেন জানা দরকার। দুইভাবে জানাতে পারেন:', 'To show the right times, the app needs to know where you are. You can tell it in two ways:')}</Text>
      <Text style={st.h3}>{tr('১. ফোনের GPS দিয়ে (সবচেয়ে সঠিক)', '1. With the phone\'s GPS (most accurate)')}</Text>
      <Button title={busy ? tr('অবস্থান খোঁজা হচ্ছে…', 'Finding your location…') : tr('আমার অবস্থান বের করুন', 'Find my location')} icon="📍" onPress={useGps} loading={busy} a11yHint={tr('ফোন অবস্থানের অনুমতি চাইবে', 'The phone will ask for location permission')} />
      <Text style={st.small}>{tr('🔒 আপনার অবস্থান শুধু এই ফোনেই থাকে, কোথাও পাঠানো হয় না।', '🔒 Your location stays only on this phone and is not sent anywhere.')}</Text>
      {err ? (
        <Notice kind="warn" title={GPS_ERR[err] || GPS_ERR.nofix}>
          {err === 'blocked' ? <Button title={tr('ফোনের সেটিংস খুলুন', 'Open phone settings')} icon="⚙️" kind="secondary" onPress={() => Linking.openSettings().catch(() => {})} style={{ marginTop: S.sm }} /> : null}
        </Notice>
      ) : null}
      <Text style={[st.h3, { marginTop: S.lg }]}>{tr('২. তালিকা থেকে শহর বেছে নিন', '2. Pick a city from the list')}</Text>
      {CITY_GROUPS.map((g) => (
        <View key={g.id}>
          <Text style={st.group}>{tr(g.title, g.en)}</Text>
          <View style={st.grid}>
            {CITIES.filter((c) => c.group === g.id).map((c) => (
              <Pressable key={c.id} onPress={() => onChoose({ kind: 'city', lat: c.lat, lng: c.lng, label: tr(c.name, c.en), cityId: c.id })}
                style={({ pressed }) => [st.city, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={tr(`${c.name} বেছে নিন`, `Choose ${c.en}`)}>
                <Text style={st.cityT}>{tr(c.name, c.en)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {hasLoc ? <Button title={tr('বাতিল, আগের জায়গাই থাকুক', 'Cancel, keep the earlier place')} kind="secondary" onPress={onCancel} style={{ marginTop: S.md }} /> : null}
    </>
  );
}

function Times({ loc, now, navigation }: { loc: Place; now: number; navigation: Nav }) {
  let plan;
  try { plan = dayPlan(loc, now); } catch (e) { plan = null; }
  if (!plan) return <Notice kind="bad" title={tr('সময় হিসাব করা যায়নি', 'Could not calculate the times')} text={tr('জায়গা বদলে আবার চেষ্টা করুন।', 'Change the place and try again.')} />;
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
  const openSalah = (section: string) => navigation.navigate('Salah', { section, from: 'Prayer', t: Date.now() });
  const mk = makruhWindows(times);
  const mkNow = mk.find((w) => now >= w.from && now < w.to);

  return (
    <>
      <Text style={st.date}>{date.greg}</Text>
      <Text style={st.hijri}>{date.hijri} ({tr('আনুমানিক', 'approximate')})</Text>
      <View style={st.hero} accessible accessibilityLabel={tr(`পরের নামাজ ${nextName}, ${nt.part} ${nt.time}। আর ${fmtLeft(nextAt - now)} বাকি।`, `Next prayer ${nextName}, ${nt.time} ${nt.part}. ${fmtLeft(nextAt - now)} left.`)}>
        <Text style={st.heroNow}>{between ? tr('এখন কোনো ফরজ নামাজের ওয়াক্ত নেই', 'No fard prayer time right now') : tr(`এখন ${cur.gen} ওয়াক্ত চলছে`, `${cur.gen} time now`)}</Text>
        <Text style={st.heroL}>{tr('পরের নামাজ', 'Next prayer')}</Text>
        <Text style={st.heroN}>{next.icon} {nextName}  <Text style={st.heroT}>{nt.time}</Text> <Text style={st.heroP}>{nt.part}</Text></Text>
        <View style={st.leftPill}><Text style={st.leftT}>{tr(`⏳ আর ${fmtLeft(nextAt - now)} বাকি`, `⏳ ${fmtLeft(nextAt - now)} left`)}</Text></View>
      </View>
      {mkNow ? <Notice kind="warn" title={tr(`এখন নামাজ পড়ার মাকরুহ সময় (${mkNow.label})`, `Now is a makruh time for prayer (${mkNow.label})`)} text={tr(`আর প্রায় ${fmtLeft(mkNow.to - now)} পর নামাজ পড়ুন।`, `Pray after about ${fmtLeft(mkNow.to - now)}.`)} /> : null}
      {friday ? <Notice kind="info" title={tr('আজ শুক্রবার: জুমার দিন', 'Today is Friday: the day of Jumu\'ah')} text={tr('যোহরের ওয়াক্তে জুমার নামাজ। জামাতের সময় মসজিদ ঠিক করে, আগে আগে যান। গোসল, সূরা কাহফ ও বেশি বেশি দরুদ পড়া সুন্নত।', 'Jumu\'ah is prayed in the Dhuhr time. The mosque sets the congregation time, so go early. Bathing, reading Surah al-Kahf and sending many durud are sunnah.')}>
        <Button title={tr('জুমার নিয়ম ও রাকাত', 'Jumu\'ah rules and rak\'ahs')} icon="🕌" kind="secondary" onPress={() => openSalah('jumuah')} style={{ marginTop: S.sm }} />
      </Notice> : null}
      <Text style={st.tapHint}>{tr('👇 যেকোনো নামাজে চাপ দিলে তার রাকাত ও নিয়ম দেখাবে।', '👇 Tap any prayer to see its rak\'ahs and rules.')}</Text>
      {ORDER.map((o) => {
        const t = fmtTime(times[o.key], tz, o.key);
        const isNext = o.key === next.key && times[o.key] === nextAt;
        const past = times[o.key] <= now && !isNext;
        const name = prayerName(o, today);
        const section = o.key === 'dhuhr' && friday ? 'jumuah' : o.key;
        const info = salahL().SALAH.find((x) => x.id === section);
        return (
          <Pressable key={o.key} disabled={o.notPrayer} onPress={() => openSalah(section)}
            style={({ pressed }) => [st.row, isNext && st.rowNext, o.notPrayer && st.rowSun, pressed && { opacity: 0.85 }]}
            accessibilityRole={o.notPrayer ? 'text' : 'button'}
            accessibilityLabel={`${name}${o.notPrayer ? tr(' (নামাজ নয়, ফজরের শেষ সময়)', ' (not a prayer; end of Fajr time)') : ''}, ${getLang() === 'en' ? `${t.time} ${t.part}` : `${t.part} ${t.time}`}${isNext ? tr(', পরের নামাজ', ', next prayer') : ''}${info ? `. ${info.what}` : ''}`}
            accessibilityHint={o.notPrayer ? undefined : tr('রাকাত ও নিয়ম খুলবে', 'Opens the rak\'ahs and rules')}>
            <Text style={st.rowIc} importantForAccessibility="no">{o.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[st.rowN, past && { color: C.muted }]}>{name}</Text>
              {o.notPrayer ? <Text style={st.rowSub}>{tr('ফজরের সময় শেষ', 'End of Fajr time')}</Text> : null}
              {info ? <Text style={st.rowSub}>{info.what} ›</Text> : null}
              {isNext ? <Text style={st.nextTag}>{tr('▶ পরের নামাজ', '▶ Next prayer')}</Text> : null}
            </View>
            <Text style={[st.rowT, past && { color: C.muted }]}>{t.time}</Text>
            <Text style={st.rowP}>{t.part}</Text>
          </Pressable>
        );
      })}
      <Reminders loc={loc} />
      {saudi ? <Notice kind="info" title={tr(`হানাফি মতে আসর শুরু: ${alt.part} ${alt.time}`, `Asr starts by the Hanafi view: ${alt.time} ${alt.part}`)} text={tr('ওপরের আসরের সময় সৌদি আরবের সরকারি সময় (হারামের আজান)। হারামের জামাতে নামাজ পড়া নিয়ে আপনার আলেমের পরামর্শ মেনে চলুন।', 'The Asr time above is the official Saudi time (the Haram\'s adhan). Follow your scholar\'s advice about praying with the Haram congregation.')} /> : null}
      {times.ramadan && saudi ? <Notice kind="info" title={tr('রমজানে এশা', 'Isha in Ramadan')} text={tr('রমজানে মক্কা-মদিনায় এশার আজান মাগরিবের প্রায় দুই ঘণ্টা পরে হয়। ওপরের সময় সেভাবেই হিসাব করা।', 'In Ramadan the Isha adhan in Makkah and Madinah is about two hours after Maghrib. The time above is calculated that way.')} /> : null}
      <View style={st.mk}>
        <Text style={st.mkH}>{tr('⛔ আজ যে সময় নামাজ পড়া নিষেধ (আনুমানিক)', '⛔ Times when prayer is not allowed today (approximate)')}</Text>
        {mk.map((w) => {
          const a = fmtTime(w.from, tz); const b = fmtTime(w.to, tz);
          const on = now >= w.from && now < w.to;
          return (
            <View key={w.key} style={[st.mkRow, on && st.mkOn]} accessible accessibilityLabel={tr(`${w.label}: ${a.part} ${a.time} থেকে ${b.time}${on ? ', এখন চলছে' : ''}`, `${w.label}: ${a.time} to ${b.time} ${a.part}${on ? ', now' : ''}`)}>
              <Text style={st.mkL}>{w.label}{on ? tr(' · এখন চলছে', ' · now') : ''}</Text>
              <Text style={st.mkT}>{a.time} – {b.time} <Text style={st.rowP}>{b.part}</Text></Text>
            </View>
          );
        })}
        <Text style={st.infoT}>{tr('এছাড়া ফজরের পর সূর্যোদয় পর্যন্ত এবং আসরের পর সূর্যাস্ত পর্যন্ত নফল নামাজ নয় (কাজা পড়া যায়)। (মুসলিম ৮৩১; বুখারি ৫৮৬)', 'Also, no nafl prayer from after Fajr until sunrise and from after Asr until sunset (missed prayers may be made up). (Muslim 831; Bukhari 586)')}</Text>
      </View>
      <Button title={tr('নামাজের রাকাত ও নিয়ম (সব নামাজ)', 'Prayer rak\'ahs and rules (all prayers)')} icon="📖" kind="secondary" onPress={() => navigation.navigate('Salah', { t: Date.now() })} style={{ marginTop: S.sm }} />
      <View style={st.info}>
        <Text style={st.infoT}>🧮 {tr('হিসাবের পদ্ধতি', 'Calculation method')}: {times.method.name}.</Text>
        <Text style={st.infoT}>{tr('ℹ️ স্থানীয় মসজিদের সময়সূচির সাথে ১-৩ মিনিট পার্থক্য হতে পারে। মসজিদের আজান অনুযায়ী জামাতে শরিক হোন।', 'ℹ️ There may be a 1-3 minute difference from the local mosque timetable. Join the congregation by the mosque\'s adhan.')}</Text>
      </View>
    </>
  );
}

const REM_ERR: Record<string, string> = {
  get unsupported() { return tr('এই ফোনে রিমাইন্ডার চালু করা যায় না।', 'Reminders cannot be turned on on this phone.'); },
  get denied() { return tr('নোটিফিকেশনের অনুমতি দেওয়া হয়নি। আবার চাপুন এবং "অনুমতি দিন" বাছুন।', 'Notification permission was not given. Tap again and choose "Allow".'); },
  get blocked() { return tr('নোটিফিকেশন বন্ধ করা আছে। ফোনের সেটিংসে গিয়ে এই অ্যাপের নোটিফিকেশন চালু করুন।', 'Notifications are off. Turn on notifications for this app in the phone settings.'); },
  get failed() { return tr('রিমাইন্ডার চালু করা যায়নি। আবার চেষ্টা করুন।', 'Could not turn on reminders. Try again.'); },
};
function Reminders({ loc }: { loc: Place }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { remindersOn().then(setOn); }, []);
  if (on === null) return null;
  const turnOn = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    const r = await enableReminders(loc);
    setBusy(false);
    if (r.ok) setOn(true); else setErr(r.error || 'failed');
  };
  const turnOff = async () => { if (busy) return; setBusy(true); await disableReminders(); setBusy(false); setOn(false); };
  return (
    <View style={[st.rem, on && st.remOn]}>
      <Text style={st.remH}>🔔 {tr('নামাজের রিমাইন্ডার', 'Prayer reminders')}: {on ? tr('চালু আছে', 'on') : tr('বন্ধ', 'off')}</Text>
      <Text style={st.remT}>{on ? tr(`প্রতি ওয়াক্তের শুরুতে ফোনে নোটিফিকেশন আসবে (${placeName(loc)} অনুযায়ী)। কয়েক মিনিট এদিক-ওদিক হতে পারে।`, `A notification comes at the start of each prayer time (for ${placeName(loc)}). It may be off by a few minutes.`) : tr('চালু করলে প্রতি ওয়াক্তের শুরুতে ফোনে নোটিফিকেশন আসবে। ইন্টারনেট লাগবে না।', 'Turn on to get a notification at the start of each prayer time. No internet needed.')}</Text>
      {err ? <Notice kind="warn" title={REM_ERR[err] || REM_ERR.failed}>
        {err === 'blocked' ? <Button title={tr('ফোনের সেটিংস খুলুন', 'Open phone settings')} icon="⚙️" kind="secondary" onPress={() => Linking.openSettings().catch(() => {})} style={{ marginTop: S.sm }} /> : null}
      </Notice> : null}
      {remindersSupported ? (on
        ? <Button title={tr('রিমাইন্ডার বন্ধ করুন', 'Turn off reminders')} icon="🔕" kind="secondary" onPress={turnOff} loading={busy} />
        : <Button title={tr('রিমাইন্ডার চালু করুন', 'Turn on reminders')} icon="🔔" onPress={turnOn} loading={busy} a11yHint={tr('ফোন নোটিফিকেশনের অনুমতি চাইতে পারে', 'The phone may ask for notification permission')} />)
        : <Text style={st.remT}>{REM_ERR.unsupported}</Text>}
      {on && remindersSupported ? <Alarms loc={loc} /> : null}
    </View>
  );
}

// Per prayer: a loud alarm (long tone + vibration, "10 minutes later" button) instead of a short notification sound.
function Alarms({ loc }: { loc: Place }) {
  const [a, setA] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { getAlarms().then(setA); }, []);
  if (!a) return null;
  const toggle = async (key: string) => {
    if (busy) return;
    setBusy(key);
    try { await setAlarm(key, !a[key]); setA(await getAlarms()); await refreshReminders(loc); } finally { setBusy(null); }
  };
  return (
    <View style={{ marginTop: S.md }}>
      <Text style={st.remH}>{tr('⏰ অ্যালার্ম (জোরে, লম্বা শব্দ)', '⏰ Alarm (loud, long sound)')}</Text>
      <Text style={st.remT}>{tr('যে ওয়াক্তে ঘুম ভাঙাতে বা নিশ্চিত মনে করাতে চান, সেটির অ্যালার্ম চালু করুন। ফোন প্রায় ২০ সেকেন্ড বাজবে ও কাঁপবে; "১০ মিনিট পরে আবার" চাপা যাবে। ফোন নীরব (silent) থাকলে শুধু কাঁপতে পারে।', 'Turn on the alarm for the prayer you want to wake up for or be surely reminded of. The phone rings and vibrates for about 20 seconds; you can tap "again in 10 minutes". If the phone is silent it may only vibrate.')}</Text>
      {ORDER.filter((o) => !o.notPrayer).map((o) => (
        <Pressable key={o.key} onPress={() => toggle(o.key)} disabled={!!busy} accessibilityRole="switch" accessibilityState={{ checked: !!a[o.key], busy: busy === o.key }}
          accessibilityLabel={tr(`${o.name}-এর অ্যালার্ম ${a[o.key] ? 'চালু' : 'বন্ধ'}`, `${o.name} alarm ${a[o.key] ? 'on' : 'off'}`)}
          style={{ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, marginTop: S.xs, borderRadius: R.md, borderWidth: 2,
            borderColor: a[o.key] ? C.primary : C.line, backgroundColor: a[o.key] ? C.primarySoft : C.card }}>
          <Text style={[st.remT, { flex: 1 }]}>{o.icon} {o.name}</Text>
          <Text style={st.remT}>{busy === o.key ? '…' : a[o.key] ? tr('⏰ চালু', '⏰ On') : tr('🔕 বন্ধ', '🔕 Off')}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Qibla({ loc }: { loc: Place }) {
  const q = qiblaBearing(loc.lat, loc.lng);
  const km = distanceKm(loc.lat, loc.lng);
  const [h, setH] = useState<{ heading: number; accuracy: number } | null>(null);          // { heading, accuracy } or null
  const [state, setState] = useState('start'); // start | on | none
  const wasAligned = useRef(false);

  useEffect(() => {
    let stop: (() => void) | null = null; let alive = true;
    // raw compass readings jump by several degrees: show a smoothed heading (the short way round 0°)
    watchHeading((v) => { if (alive) { setH((p) => ({ heading: smoothHeading(p ? p.heading : null, v.heading), accuracy: v.accuracy })); setState('on'); } }).then((s) => {
      if (!alive) { if (s) s(); return; }
      stop = s;
      if (!s) setState('none');
    });
    const t = setTimeout(() => { if (alive) setState((x) => (x === 'start' ? 'none' : x)); }, 6000);
    return () => { alive = false; clearTimeout(t); if (stop) stop(); };
  }, []);

  const turn = h ? qiblaTurn(q, h.heading, wasAligned.current) : null;   // shortest way; "facing" on at 5°, off after 9°
  const aligned = !!turn && turn.aligned;
  useEffect(() => {
    if (aligned && !wasAligned.current) Vibration.vibrate(80);
    wasAligned.current = aligned;
  }, [aligned]);

  if (km < 1) {
    return <Notice kind="ok" title={tr('আপনি কাবার একদম কাছে আছেন', 'You are very close to the Kaaba')} text={tr('মসজিদুল হারামে কম্পাসের দরকার নেই। সরাসরি কাবার দিকে মুখ করে নামাজ পড়ুন।', 'No compass is needed in Masjid al-Haram. Face the Kaaba directly and pray.')} />;
  }
  return (
    <>
      <View style={st.qInfo}>
        <Text style={st.qBig}>{toBn(Math.round(q))}°</Text>
        <Text style={st.p}>{tr(`উত্তর দিক থেকে ঘড়ির কাঁটার দিকে ${toBn(Math.round(q))} ডিগ্রি, মোটামুটি `, `${Math.round(q)} degrees clockwise from north, roughly `)}<Text style={{ fontWeight: '700' }}>{directionName(q)}</Text>{tr(` দিকে। কাবা এখান থেকে প্রায় ${toBn(Math.round(km))} কিলোমিটার দূরে।`, `. The Kaaba is about ${Math.round(km)} km from here.`)}</Text>
      </View>
      {state === 'on' && h ? (
        <>
          <View style={st.dialWrap} accessible accessibilityLiveRegion="polite"
            accessibilityLabel={aligned ? tr('আপনি এখন কিবলামুখী', 'You are facing the Qibla now') : tr(`${turn?.side === 'right' ? 'ডান' : 'বাঁ'} দিকে ${turn?.deg ?? 0} ডিগ্রি ঘুরুন`, `Turn ${turn?.deg ?? 0} degrees to the ${turn?.side === 'right' ? 'right' : 'left'}`)}>
            <Text style={st.pointer} importantForAccessibility="no">▲</Text>
            <View style={[st.dial, aligned && st.dialOk, { transform: [{ rotate: `${-h.heading}deg` }] }]}>
              {(getLang() === 'en' ? [['N', 0], ['E', 90], ['S', 180], ['W', 270]] : [['উ', 0], ['পূ', 90], ['দ', 180], ['প', 270]]).map(([l, a]) => (   // i18n-ok: English first
                <View key={l} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${a}deg` }] }]}>
                  <Text style={[st.cardinal, a === 0 && { color: C.bad }]}>{l}</Text>
                </View>
              ))}
              <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${q}deg` }] }]}>
                <Text style={st.kaaba}>🕋</Text>
                <View style={st.qLine} />
              </View>
            </View>
          </View>
          {aligned ? <Notice kind="ok" title={tr('আপনি এখন কিবলামুখী', 'You are facing the Qibla now')} text={tr('ফোনের ওপরের দিক যেদিকে, সেদিকে মুখ করে দাঁড়ান।', 'Stand facing the way the top of the phone points.')} />
            : <Text style={st.turn}>{turn?.side === 'right' ? tr(`↻ ডান দিকে আরও ${toBn(turn?.deg ?? 0)}° ঘুরুন`, `↻ Turn ${turn?.deg ?? 0}° more to the right`) : tr(`↺ বাঁ দিকে আরও ${toBn(turn?.deg ?? 0)}° ঘুরুন`, `↺ Turn ${turn?.deg ?? 0}° more to the left`)}</Text>}
          {compassWeak(h.accuracy, Platform.OS) ? <Notice kind="warn" title={tr('কম্পাস ঠিকমতো কাজ করছে না', 'The compass is not working well')} text={tr('ফোনটা বাতাসে ইংরেজি 8-এর মতো করে কয়েকবার ঘুরান, তারপর আবার দেখুন।', 'Move the phone in the air in a figure 8 a few times, then look again.')} /> : null}
          <Text style={st.small}>{tr('ফোনটা টেবিলের মতো সমান করে ধরুন। লোহা, গাড়ি বা চুম্বক থেকে দূরে থাকুন। 🕋 চিহ্ন ওপরের ▲ বরাবর এলে আপনি কিবলামুখী।', 'Hold the phone flat like a table. Keep away from iron, cars or magnets. When 🕋 lines up with the ▲ at the top, you face the Qibla.')}</Text>
        </>
      ) : state === 'start' ? (
        <View style={st.center2}><ActivityIndicator color={C.primary} /><Text style={st.small}>{tr('কম্পাস চালু হচ্ছে…', 'Starting the compass…')}</Text></View>
      ) : (
        <Notice kind="warn" title={tr('এই ফোনে কম্পাস পাওয়া যায়নি', 'No compass found on this phone')} text={tr(`ওপরের ডিগ্রি দেখে দিক ঠিক করুন, অথবা মসজিদ বা হোটেলে কিবলার চিহ্ন দেখে নিন। ${directionName(q)} দিক।`, `Use the degrees above to find the direction, or look for the Qibla sign in a mosque or hotel. Direction: ${directionName(q)}.`)} />
      )}
      <Text style={st.small}>{tr('📚 কিবলার দিক মেনে নামাজ: সূরা বাকারা ২:১৪৪', '📚 Praying towards the Qibla: Surah al-Baqarah 2:144')}</Text>
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
  pointer: { fontSize: 28, color: C.primary, marginBottom: -4 },
  dial: { width: 260, height: 260, borderRadius: 130, borderWidth: 6, borderColor: C.primary, backgroundColor: C.card, ...shadow },
  dialOk: { borderColor: C.ok, backgroundColor: C.okSoft },
  cardinal: { position: 'absolute', top: 8, alignSelf: 'center', fontSize: F.large, fontWeight: '700', color: C.primary },
  kaaba: { position: 'absolute', top: 30, alignSelf: 'center', fontSize: 34 },
  qLine: { position: 'absolute', top: 76, bottom: 124, alignSelf: 'center', width: 4, borderRadius: 2, backgroundColor: C.gold },
  turn: { fontSize: F.large, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: S.sm },
});
