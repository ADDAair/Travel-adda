import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { tr } from '../lib/lang';
import { C, S } from '../theme';
import { Button, Notice } from '../components/ui';
import { notReady, telBd } from '../lib/groups';
import { myKhademGroups, khademMembers, faqList, myKhademInvites, khademRespond } from '../lib/help';
import { toBn } from '../lib/phone';
import { st } from './GroupScreen';
import type { Msg, Nav } from './navTypes';

// Khadem: the groups I serve. For each: questions waiting, the hajis (phone after their contract), the ready answers.
export default function KhademHomeScreen({ navigation }: { navigation: Nav }) {
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof myKhademGroups>> | undefined>(undefined);
  const [state, setState] = useState('load');
  const [open, setOpen] = useState<string | null>(null);                 // group id shown in detail
  const [members, setMembers] = useState<Awaited<ReturnType<typeof khademMembers>> | null>(null);
  const [faq, setFaq] = useState<Awaited<ReturnType<typeof faqList>>>([]);
  const [invites, setInvites] = useState<Awaited<ReturnType<typeof myKhademInvites>>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    try { setInvites(await myKhademInvites()); } catch (e) { setInvites([]); }   // before step 021: none
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
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}><Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('🤝 খাদেমের পাতা', '🤝 Khadem page')}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {invites.map((iv) => (
        <View key={iv.group_id} style={[st.card, { borderWidth: 2, borderColor: C.gold }]}>
          <Text style={st.h}>{tr('📩 খাদেম হওয়ার অনুরোধ', '📩 Request to be a khadem')}</Text>
          <Text style={st.p}>{tr(`"${iv.group_name}" দলের লিডার ${iv.leader_name} (${iv.leader_code}) আপনাকে খাদেম হতে বলেছেন।`, `Leader ${iv.leader_name} (${iv.leader_code}) of the group "${iv.group_name}" has asked you to be a khadem.`)}</Text>
          <Text style={st.small}>{tr('রাজি হলে আপনি দলের হাজীদের দেখবেন, তাঁদের প্রশ্নের উত্তর দেবেন, আর চুক্তি হওয়া হাজীদের ফোন নম্বর পাবেন।', 'If you agree, you will see the group\'s hajis, answer their questions, and get the phone numbers of hajis with a contract.')}</Text>
          <Button title={tr('রাজি, খাদেম হব', 'I agree, I will be a khadem')} icon="✅" loading={busy} style={{ marginTop: S.sm }} onPress={async () => {
            if (busy) return; setBusy(true); setMsg(null);
            try { const r = await khademRespond(iv.group_id, true); setMsg(r === 'ok' ? { kind: 'ok', text: tr('আপনি এখন এই দলের খাদেম। লিডার জানতে পারবেন।', 'You are now a khadem of this group. The leader will be told.') } : r === 'limit' ? { kind: 'warn', text: tr('এই দলে খাদেমের জায়গা আর নেই (সর্বোচ্চ ১০ জন)।', 'There is no more room for khadems in this group (10 at most).') } : { kind: 'info', text: tr('অনুরোধটি আর নেই।', 'The request no longer exists.') }); await load(); }
            catch (e) { setMsg({ kind: 'bad', text: tr('হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।', 'It did not work. Check the internet and try again.') }); } finally { setBusy(false); }
          }} />
          <Button title={tr('না, রাজি নই', 'No, I do not agree')} kind="secondary" disabled={busy} style={{ marginTop: S.sm }} onPress={async () => {
            if (busy) return; setBusy(true); setMsg(null);
            try { await khademRespond(iv.group_id, false); setMsg({ kind: 'ok', text: tr('অনুরোধটি ফিরিয়ে দেওয়া হয়েছে।', 'The request was declined.') }); await load(); }
            catch (e) { setMsg({ kind: 'bad', text: tr('হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।', 'It did not work. Check the internet and try again.') }); } finally { setBusy(false); }
          }} />
        </View>
      ))}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই আসছে', 'Coming soon')} text={tr('খাদেমের সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে।', 'The last step to turn on khadem features is still to come.')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('তথ্য আনা যায়নি', 'Could not load the information')} text={tr('ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'Check the internet connection and try again.')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && groups && groups.length === 0 && !invites.length ? <Notice kind="info" title={tr('আপনি এখন কোনো দলের খাদেম নন', 'You are not a khadem of any group now')} text={tr('কোনো লিডার আপনাকে তাঁর দলের খাদেম করলে নোটিফিকেশন পাবেন, তখন এখানে দলটি দেখাবে।', 'When a leader makes you a khadem of their group, you will get a notification and the group will show here.')} /> : null}
      {(groups || []).map((g) => (
        <View key={g.group_id} style={st.card}>
          <Pressable onPress={() => setOpen(open === g.group_id ? null : g.group_id)} accessibilityRole="button" accessibilityState={{ expanded: open === g.group_id }} accessibilityLabel={tr(`${g.group_name} দল। লিডার ${g.leader_name}`, `Group ${g.group_name}. Leader ${g.leader_name}`)} style={{ minHeight: 48 }}>
            <Text style={st.gName}>{open === g.group_id ? '▾' : '▸'} {g.group_name}</Text>
            <Text style={st.small}>{tr(`লিডার: ${g.leader_name} · হাজী: ${toBn(g.member_count)} জন`, `Leader: ${g.leader_name} · Hajis: ${g.member_count}`)}</Text>
          </Pressable>
          <Button title={g.waiting ? tr(`হাজীদের প্রশ্ন (${toBn(g.waiting)}টির উত্তর বাকি)`, `Hajis' questions (${g.waiting} waiting for an answer)`) : tr('হাজীদের প্রশ্ন', 'Hajis\' questions')} icon="💬" kind={g.waiting ? 'primary' : 'secondary'}
            onPress={() => navigation.navigate('HelpInbox', { groupId: g.group_id })} style={{ marginTop: S.sm }} />
          {open === g.group_id ? (
            <>
              <Text style={[st.h, { marginTop: S.md }]}>{tr('👥 দলের হাজী', '👥 Hajis in the group')}</Text>
              {members === null ? <ActivityIndicator color={C.primary} /> : null}
              {members && members.length === 0 ? <Text style={st.p}>{tr('এখনো কেউ দলে নেই।', 'Nobody is in the group yet.')}</Text> : null}
              {(members || []).map((m) => (
                <View key={m.user_id} style={{ borderTopWidth: 1, borderColor: C.line, paddingVertical: S.sm }}>
                  <Text style={st.val}>🕋 {m.full_name}</Text>
                  <Text style={st.small}>{tr('আইডি', 'ID')}: {m.haji_code}{m.status === 'invited' ? tr(' · আমন্ত্রণ পাঠানো হয়েছে', ' · invitation sent') : ''}</Text>
                  {m.phone ? <Button title={tr(`ফোন করুন (${toBn(m.phone)})`, `Call (${m.phone})`)} icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(m.phone)}`).catch(() => {})} style={{ marginTop: S.xs }} />
                    : <Text style={st.small}>{tr('🔒 লিডারের সাথে এই হাজীর চুক্তি চালু হলে নম্বর দেখাবে।', '🔒 The number shows once this haji\'s contract with the leader is active.')}</Text>}
                </View>
              ))}
              {faq.length ? (
                <>
                  <Text style={[st.h, { marginTop: S.md }]}>{tr('📋 লিডারের তৈরি উত্তর', '📋 The leader\'s ready answers')}</Text>
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
