import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { Text, Pressable, ActivityIndicator } from 'react-native';
import { tr } from '../lib/lang';
import ScrollView from '../components/KbScroll';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import WorkAreaFields, { type Area } from '../components/WorkAreaFields';
import DistrictPicker from '../components/DistrictPicker';
import { LEADER_KINDS, PROFESSIONS, professionName } from '../lib/leaderKinds';
import { starText } from '../components/market';
import { supabase } from '../lib/supabase';
import { notReady } from '../lib/groups';
import { leaderPublic } from '../lib/market';
import { st, errText } from './GroupScreen';
import type { Msg, Nav } from './navTypes';
import type { Res, TableUpdate } from '../lib/types';

// Leader: how hajis see me in the directory; I can change my work area and a short introduction (licences only via admin).
export default function LeaderMeScreen({ navigation }: { navigation: Nav }): JSX.Element {
  const [p, setP] = useState<Res<typeof leaderPublic> | undefined>(undefined);
  const [area, setArea] = useState<Area>({ district: '', upazila: '', union: '' });
  const [bio, setBio] = useState('');
  const [profession, setProfession] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) throw new Error('no session');
      const me = await leaderPublic(s.session.user.id);
      setP(me || null);
      if (me) { setArea({ district: me.district || '', upazila: me.upazila || '', union: me.union_name || '' }); setBio(me.bio || ''); setProfession(me.profession || ''); }
    } catch (e) { setP(null); setMsg({ kind: notReady(e) ? 'info' : 'bad', text: notReady(e) ? tr('শীঘ্রই চালু হবে।', 'Coming soon.') : errText(e) }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) throw new Error('no session');
      const uid = s.session.user.id;
      const row: TableUpdate<'leader_profiles'> = { district: area.district || null, upazila: (area.upazila || '').trim() || null, bio: bio.trim() || null, union_name: (area.union || '').trim() || null };
      if (p && 'profession' in p) row.profession = profession.trim() || null;      // step 017
      let r = await supabase.from('leader_profiles').update(row).eq('user_id', uid).select('user_id');
      if (r.error && (r.error.code === 'PGRST204' || r.error.code === '42703' || /union_name/i.test(r.error.message || ''))) {
        // step 014 not run yet: keep the union inside the upazila text so nothing typed is lost
        const un = row.union_name; delete row.union_name;
        if (un) row.upazila = [row.upazila, un].filter(Boolean).join(', ').slice(0, 60);
        r = await supabase.from('leader_profiles').update(row).eq('user_id', uid).select('user_id');
      }
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) throw new Error('not saved');
      setMsg({ kind: 'ok', text: tr('সংরক্ষণ হয়েছে।', 'Saved.') }); await load();
    } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Leader')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('লিডার প্যানেলে ফিরে যান', 'Back to the leader panel')}><Text style={st.backT}>{tr('‹ লিডার প্যানেল', '‹ Leader panel')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('👤 আমার লিডার প্রোফাইল', '👤 My leader profile')}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {p === undefined ? <ActivityIndicator color={C.primary} /> : null}
      {p ? (
        <>
          <Notice kind="info" title={tr('হাজীরা তালিকায় যা দেখেন', 'What hajis see in the list')} text={`${p.full_name} · ${p.leader_code} · ${p.leader_kind === 'travel_adda' ? LEADER_KINDS.travel_adda.badge : p.agency_name}${p.profession ? ` · ${professionName(p.profession)}` : ''}\n${starText(p.rating_avg, p.rating_count)}${p.complaints_verified ? tr(` · যাচাই করা অভিযোগ: ${p.complaints_verified}`, ` · verified complaints: ${p.complaints_verified}`) : ''}\n${tr('আপনার ফোন নম্বর তালিকায় দেখানো হয় না।', 'Your phone number is not shown in the list.')}`} />
          {'profession' in p ? (
            <DistrictPicker label={tr('আপনার পেশা (ঐচ্ছিক)', 'Your profession (optional)')} value={profession} onChange={setProfession} options={PROFESSIONS}
              placeholder={tr('পেশা বাছুন', 'Choose a profession')} searchHint={tr('যেমন: ইমাম', 'e.g. Imam')} noun={tr('পেশা', 'profession')} allowOther nameOf={professionName} />
          ) : null}
          <WorkAreaFields value={area} onChange={setArea} />
          <Field label={tr('নিজের সম্পর্কে দু-চার কথা', 'A few words about yourself')} hint={tr('যেমন: ১৫ বছর ধরে ওমরাহ করাচ্ছি, মহিলা গাইড আছে', 'e.g. leading Umrah for 15 years, women guides available')} value={bio} onChangeText={setBio} multiline maxLength={600} />
          <Button title={tr('সংরক্ষণ করুন', 'Save')} icon="💾" onPress={save} loading={busy} />
          <Text style={[st.small, { marginTop: S.md }]}>{p.leader_kind === 'travel_adda' ? tr('লিডারের ধরন বদলাতে হেল্পলাইনে যোগাযোগ করুন।', 'To change the kind of leader, contact the helpline.') : tr('এজেন্সির নাম বা লাইসেন্স নম্বর বদলাতে হেল্পলাইনে যোগাযোগ করুন; অ্যাডমিন যাচাই করে বদলে দেবেন।', 'To change the agency name or licence number, contact the helpline; the admin will check and change it.')}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}
