import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { C, S } from '../theme';
import { Button, Notice } from '../components/ui';
import { notReady, telBd } from '../lib/groups';
import { myKhademGroups, khademMembers, faqList } from '../lib/help';
import { toBn } from '../lib/phone';
import { st } from './GroupScreen';

// Khadem: the groups I serve. For each: questions waiting, the hajis (phone after their contract), the ready answers.
export default function KhademHomeScreen({ navigation }) {
  const [groups, setGroups] = useState(undefined);
  const [state, setState] = useState('load');
  const [open, setOpen] = useState(null);                 // group id shown in detail
  const [members, setMembers] = useState(null);
  const [faq, setFaq] = useState([]);

  const load = useCallback(async () => {
    try { const g = await myKhademGroups(); setGroups(g); setState('ok'); if (g.length === 1) setOpen((o) => o || g[0].group_id); }
    catch (e) { setGroups([]); setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);
  useEffect(() => {
    if (!open) return;
    setMembers(null);
    Promise.all([khademMembers(open), faqList(open)]).then(([m, f]) => { setMembers(m); setFaq(f); }).catch(() => setMembers([]));
  }, [open]);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান"><Text style={st.backT}>‹ হোম</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">🤝 খাদেমের পাতা</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই আসছে" text="খাদেমের সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && groups && groups.length === 0 ? <Notice kind="info" title="আপনি এখন কোনো দলের খাদেম নন" text="কোনো লিডার আপনাকে তাঁর দলের খাদেম করলে নোটিফিকেশন পাবেন, তখন এখানে দলটি দেখাবে।" /> : null}
      {(groups || []).map((g) => (
        <View key={g.group_id} style={st.card}>
          <Pressable onPress={() => setOpen(open === g.group_id ? null : g.group_id)} accessibilityRole="button" accessibilityState={{ expanded: open === g.group_id }} accessibilityLabel={`${g.group_name} দল। লিডার ${g.leader_name}`} style={{ minHeight: 48 }}>
            <Text style={st.gName}>{open === g.group_id ? '▾' : '▸'} {g.group_name}</Text>
            <Text style={st.small}>লিডার: {g.leader_name} · হাজী: {toBn(g.member_count)} জন</Text>
          </Pressable>
          <Button title={g.waiting ? `হাজীদের প্রশ্ন (${toBn(g.waiting)}টির উত্তর বাকি)` : 'হাজীদের প্রশ্ন'} icon="💬" kind={g.waiting ? 'primary' : 'secondary'}
            onPress={() => navigation.navigate('HelpInbox', { groupId: g.group_id })} style={{ marginTop: S.sm }} />
          {open === g.group_id ? (
            <>
              <Text style={[st.h, { marginTop: S.md }]}>👥 দলের হাজী</Text>
              {members === null ? <ActivityIndicator color={C.primary} /> : null}
              {members && members.length === 0 ? <Text style={st.p}>এখনো কেউ দলে নেই।</Text> : null}
              {(members || []).map((m) => (
                <View key={m.user_id} style={{ borderTopWidth: 1, borderColor: C.line, paddingVertical: S.sm }}>
                  <Text style={st.val}>🕋 {m.full_name}</Text>
                  <Text style={st.small}>আইডি: {m.haji_code}{m.status === 'invited' ? ' · আমন্ত্রণ পাঠানো হয়েছে' : ''}</Text>
                  {m.phone ? <Button title={`ফোন করুন (${toBn(m.phone)})`} icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(m.phone)}`).catch(() => {})} style={{ marginTop: S.xs }} />
                    : <Text style={st.small}>🔒 লিডারের সাথে এই হাজীর চুক্তি চালু হলে নম্বর দেখাবে।</Text>}
                </View>
              ))}
              {faq.length ? (
                <>
                  <Text style={[st.h, { marginTop: S.md }]}>📋 লিডারের তৈরি উত্তর</Text>
                  {faq.map((f) => <View key={f.id} style={{ borderTopWidth: 1, borderColor: C.line, paddingVertical: S.sm }}><Text style={[st.p, { fontWeight: '700' }]}>❓ {f.question}</Text><Text style={st.p}>{f.answer}</Text></View>)}
                </>
              ) : null}
            </>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}
