import React, { useCallback, useEffect, useState } from 'react';
import { Text, Pressable, ActivityIndicator } from 'react-native';
import ScrollView from '../components/KbScroll';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import WorkAreaFields from '../components/WorkAreaFields';
import DistrictPicker from '../components/DistrictPicker';
import { LEADER_KINDS, PROFESSIONS } from '../lib/leaderKinds';
import { starText } from '../components/market';
import { supabase } from '../lib/supabase';
import { notReady } from '../lib/groups';
import { leaderPublic } from '../lib/market';
import { st, errText } from './GroupScreen';

// Leader: how hajis see me in the directory; I can change my work area and a short introduction (licences only via admin).
export default function LeaderMeScreen({ navigation }) {
  const [p, setP] = useState(undefined);
  const [area, setArea] = useState({ district: '', upazila: '', union: '' });
  const [bio, setBio] = useState('');
  const [profession, setProfession] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const me = await leaderPublic(s.session.user.id);
      setP(me || null);
      if (me) { setArea({ district: me.district || '', upazila: me.upazila || '', union: me.union_name || '' }); setBio(me.bio || ''); setProfession(me.profession || ''); }
    } catch (e) { setP(null); setMsg({ kind: notReady(e) ? 'info' : 'bad', text: notReady(e) ? 'শীঘ্রই চালু হবে।' : errText(e) }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const row = { district: area.district || null, upazila: area.upazila.trim() || null, bio: bio.trim() || null, union_name: area.union.trim() || null };
      if (p && 'profession' in p) row.profession = profession.trim() || null;      // step 017
      let r = await supabase.from('leader_profiles').update(row).eq('user_id', s.session.user.id).select('user_id');
      if (r.error && (r.error.code === 'PGRST204' || r.error.code === '42703' || /union_name/i.test(r.error.message || ''))) {
        // step 014 not run yet: keep the union inside the upazila text so nothing typed is lost
        const un = row.union_name; delete row.union_name;
        if (un) row.upazila = [row.upazila, un].filter(Boolean).join(', ').slice(0, 60);
        r = await supabase.from('leader_profiles').update(row).eq('user_id', s.session.user.id).select('user_id');
      }
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
          <Notice kind="info" title="হাজীরা তালিকায় যা দেখেন" text={`${p.full_name} · ${p.leader_code} · ${p.leader_kind === 'travel_adda' ? LEADER_KINDS.travel_adda.badge : p.agency_name}${p.profession ? ` · ${p.profession}` : ''}\n${starText(p.rating_avg, p.rating_count)}${p.complaints_verified ? ` · যাচাই করা অভিযোগ: ${p.complaints_verified}` : ''}\nআপনার ফোন নম্বর তালিকায় দেখানো হয় না।`} />
          {'profession' in p ? (
            <DistrictPicker label="আপনার পেশা (ঐচ্ছিক)" value={profession} onChange={setProfession} options={PROFESSIONS}
              placeholder="পেশা বাছুন" searchHint="যেমন: ইমাম" noun="পেশা" allowOther />
          ) : null}
          <WorkAreaFields value={area} onChange={setArea} />
          <Field label="নিজের সম্পর্কে দু-চার কথা" hint="যেমন: ১৫ বছর ধরে ওমরাহ করাচ্ছি, মহিলা গাইড আছে" value={bio} onChangeText={setBio} multiline maxLength={600} />
          <Button title="সংরক্ষণ করুন" icon="💾" onPress={save} loading={busy} />
          <Text style={[st.small, { marginTop: S.md }]}>{p.leader_kind === 'travel_adda' ? 'লিডারের ধরন বদলাতে হেল্পলাইনে যোগাযোগ করুন।' : 'এজেন্সির নাম বা লাইসেন্স নম্বর বদলাতে হেল্পলাইনে যোগাযোগ করুন; অ্যাডমিন যাচাই করে বদলে দেবেন।'}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}
