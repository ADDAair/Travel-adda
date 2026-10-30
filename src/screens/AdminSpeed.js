// Admin: speed check from this phone (read-only server calls, 3 times each). Shows plain Bengali results so the owner
// can tell whether slow loading comes from the internet, the server, or the app.
import React, { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { C, S } from '../theme';
import { Button, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';
import { timeCall, speedText } from '../lib/speed';
import { toBn } from '../lib/phone';
import { st } from './GroupScreen';

const CHECKS = [
  { id: 'net', label: 'ইন্টারনেট থেকে সার্ভার (শুধু যাওয়া-আসা)',
    run: () => fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY } }).then((r) => (r.ok ? {} : { error: r.status })) },
  { id: 'profile', label: 'আমার তথ্য', run: () => supabase.from('profiles').select('full_name').single() },
  { id: 'leaders', label: 'যাচাই করা লিডারের তালিকা', run: () => supabase.rpc('list_leaders', { p_district: null, p_search: null }) },
  { id: 'offers', label: 'ওমরাহ প্যাকেজের তালিকা', run: () => supabase.rpc('list_offers', { p_kind: 'umrah' }) },
  { id: 'notes', label: 'নোটিফিকেশন', run: () => supabase.rpc('my_notifications', { p_limit: 100 }) },
];

export default function SpeedTab() {
  const [res, setRes] = useState({});
  const [busy, setBusy] = useState(false);
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
      <Text style={[st.p, { marginBottom: S.sm }]}>এই ফোন আর এই ইন্টারনেটে অ্যাপের তথ্য আসতে কত সময় লাগে, মেপে দেখায়। শুধু তথ্য পড়া হয়, কিছু বদলায় না। প্রতিটি ৩ বার মাপা হয়।</Text>
      <Button title={busy ? 'মাপা হচ্ছে…' : 'গতি পরীক্ষা শুরু করুন'} icon="⏱️" onPress={run} loading={busy} style={{ marginBottom: S.md }} />
      {CHECKS.map((c) => (res[c.id] ? (
        <View key={c.id} style={st.card}>
          <Text style={st.val}>{c.label}</Text>
          <Text style={st.p}>{speedText(res[c.id])}</Text>
          <Text style={st.small}>৩ বারের সময়: {res[c.id].times.map((x) => toBn((x / 1000).toFixed(1))).join(', ')} সেকেন্ড</Text>
        </View>
      ) : null))}
      {done ? (
        <Notice kind="info" title="এই ফলাফলের স্ক্রিনশট আমাকে পাঠান"
          text={`প্রথম সারি (ইন্টারনেট) ধীর হলে সমস্যা ইন্টারনেটে; প্রথমটি দ্রুত কিন্তু বাকিগুলো ধীর হলে সমস্যা অ্যাপ বা সার্ভারে। ফোন: ${Platform.OS} ${Platform.Version}`} />
      ) : null}
    </>
  );
}
