// Admin: speed check from this phone (read-only server calls, 3 times each). Shows plain Bengali results so the owner
// can tell whether slow loading comes from the internet, the server, or the app.
import React, { useEffect, useState, type JSX } from 'react';
import { tr } from '../lib/lang';
import { View, Text, Platform } from 'react-native';
import { C, S } from '../theme';
import { Button, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';
import { timeCall, speedText, type Timing } from '../lib/speed';
import { toBn } from '../lib/phone';
import { lastStartup, startupText, type Startup } from '../lib/startup';
import { st } from './GroupScreen';

type Check = { id: string; label: string; run: () => PromiseLike<{ error?: unknown }> };
const CHECKS: Check[] = [
  { id: 'net', get label() { return tr('ইন্টারনেট থেকে সার্ভার (শুধু যাওয়া-আসা)', 'Internet to server (round trip only)'); },
    run: () => fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY } }).then((r) => (r.ok ? {} : { error: r.status })) },
  { id: 'profile', get label() { return tr('আমার তথ্য', 'My details'); }, run: () => supabase.from('profiles').select('full_name').single() },
  { id: 'leaders', get label() { return tr('যাচাই করা লিডারের তালিকা', 'List of checked leaders'); }, run: () => supabase.rpc('list_leaders', { p_district: null, p_search: null }) },
  { id: 'offers', get label() { return tr('ওমরাহ প্যাকেজের তালিকা', 'List of Umrah packages'); }, run: () => supabase.rpc('list_offers', { p_kind: 'umrah' }) },
  { id: 'notes', get label() { return tr('নোটিফিকেশন', 'Notifications'); }, run: () => supabase.rpc('my_notifications', { p_limit: 100 }) },
];

export default function SpeedTab(): JSX.Element {
  const [res, setRes] = useState<Record<string, Timing>>({});
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState<Startup | null | undefined>(undefined);
  useEffect(() => { lastStartup().then(setStart); }, []);
  const run = async () => {
    if (busy) return;
    setBusy(true); setRes({});
    for (const c of CHECKS) {
      const t = await timeCall(c.run, 3);
      setRes((r) => ({ ...r, [c.id]: t }));
    }
    setBusy(false);
  };
  const done = Object.keys(res).length === CHECKS.length;
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>{tr('এই ফোন আর এই ইন্টারনেটে অ্যাপের তথ্য আসতে কত সময় লাগে, মেপে দেখায়। শুধু তথ্য পড়া হয়, কিছু বদলায় না। প্রতিটি ৩ বার মাপা হয়।', 'Measures how long the app\'s information takes to arrive on this phone and this internet. It only reads; nothing is changed. Each is measured 3 times.')}</Text>
      {start !== undefined ? <Notice kind="info" title={tr("🚀 অ্যাপ খোলার সময়", '🚀 App opening time')} text={startupText(start)} /> : null}
      <Button title={busy ? tr('মাপা হচ্ছে…', 'Measuring…') : tr('গতি পরীক্ষা শুরু করুন', 'Start the speed test')} icon="⏱️" onPress={run} loading={busy} style={{ marginBottom: S.md }} />
      {CHECKS.map((c) => (res[c.id] ? (
        <View key={c.id} style={st.card}>
          <Text style={st.val}>{c.label}</Text>
          <Text style={st.p}>{speedText(res[c.id])}</Text>
          <Text style={st.small}>{tr('৩ বারের সময়:', 'Times for 3 runs:')} {res[c.id].times.map((x) => toBn((x / 1000).toFixed(1))).join(', ')} {tr('সেকেন্ড', 'seconds')}</Text>
        </View>
      ) : null))}
      {done ? (
        <Notice kind="info" title={tr("এই ফলাফলের স্ক্রিনশট আমাকে পাঠান", 'Send me a screenshot of this result')}
          text={tr(`প্রথম সারি (ইন্টারনেট) ধীর হলে সমস্যা ইন্টারনেটে; প্রথমটি দ্রুত কিন্তু বাকিগুলো ধীর হলে সমস্যা অ্যাপ বা সার্ভারে। ফোন: ${Platform.OS} ${Platform.Version}`, `If the first row (internet) is slow, the problem is the internet; if the first is fast but the others are slow, the problem is the app or the server. Phone: ${Platform.OS} ${Platform.Version}`)} />
      ) : null}
    </>
  );
}
