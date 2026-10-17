import React, { useCallback, useEffect, useState } from 'react';
import { Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import DistrictPicker from '../components/DistrictPicker';
import { starText } from '../components/market';
import { supabase } from '../lib/supabase';
import { notReady } from '../lib/groups';
import { leaderPublic } from '../lib/market';
import { st, errText } from './GroupScreen';

// Leader: how hajis see me in the directory; I can change area and a short introduction (licences only via admin).
export default function LeaderMeScreen({ navigation }) {
  const [p, setP] = useState(undefined);
  const [district, setDistrict] = useState('');
  const [upazila, setUpazila] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const me = await leaderPublic(s.session.user.id);
      setP(me || null);
      if (me) { setDistrict(me.district || ''); setUpazila(me.upazila || ''); setBio(me.bio || ''); }
    } catch (e) { setP(null); setMsg({ kind: notReady(e) ? 'info' : 'bad', text: notReady(e) ? 'শীঘ্রই চালু হবে।' : errText(e) }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await supabase.from('leader_profiles').update({ district: district || null, upazila: upazila.trim() || null, bio: bio.trim() || null }).eq('user_id', s.session.user.id).select('user_id');
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) throw new Error('not saved');
      setMsg({ kind: 'ok', text: 'সংরক্ষণ হয়েছে।' }); await load();
    } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Leader')} style={st.back} accessibilityRole="button" accessibilityLabel="লিডার প্যানেলে ফিরে যান"><Text style={st.backT}>‹ লিডার প্যানেল</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">👤 আমার লিডার প্রোফাইল</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {p === undefined ? <ActivityIndicator color={C.primary} /> : null}
      {p ? (
        <>
          <Notice kind="info" title="হাজীরা তালিকায় যা দেখেন" text={`${p.full_name} · ${p.leader_code} · ${p.agency_name}\n${starText(p.rating_avg, p.rating_count)}${p.complaints_verified ? ` · যাচাই করা অভিযোগ: ${p.complaints_verified}` : ''}\nআপনার ফোন নম্বর তালিকায় দেখানো হয় না।`} />
          <DistrictPicker label="অফিসের জেলা" value={district} onChange={setDistrict} />
          <Field label="উপজেলা / থানা" value={upazila} onChangeText={setUpazila} maxLength={60} />
          <Field label="নিজের সম্পর্কে দু-চার কথা" hint="যেমন: ১৫ বছর ধরে ওমরাহ করাচ্ছি, মহিলা গাইড আছে" value={bio} onChangeText={setBio} multiline maxLength={600} />
          <Button title="সংরক্ষণ করুন" icon="💾" onPress={save} loading={busy} />
          <Text style={[st.small, { marginTop: S.md }]}>এজেন্সির নাম বা লাইসেন্স নম্বর বদলাতে হেল্পলাইনে যোগাযোগ করুন; অ্যাডমিন যাচাই করে বদলে দেবেন।</Text>
        </>
      ) : null}
    </ScrollView>
  );
}
