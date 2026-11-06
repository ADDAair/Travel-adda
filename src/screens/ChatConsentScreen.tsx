import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { tr } from '../lib/lang';
import { C, S } from '../theme';
import { Button, Notice } from '../components/ui';
import { myChatConsents, respondConsent, revokeConsent, type MyConsent } from '../lib/chatConsent';
import { st, fmtDay, confirm } from './GroupScreen';

// Haji: Travel Adda asks to read the questions & answers with a leader, to settle a dispute.
// Nobody reads anything unless the haji agrees here; the permission ends after 7 days or when taken back.
type Nav = { navigate: (r: string) => void; addListener?: (e: string, f: () => void) => () => void };
type Msg = { kind: 'ok' | 'bad'; text: string } | null;

export default function ChatConsentScreen({ navigation }: { navigation: Nav }): JSX.Element {
  const [rows, setRows] = useState<MyConsent[] | undefined>(undefined);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    setErr(false);
    try { setRows(await myChatConsents()); } catch (e) { setRows([]); setErr(true); }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const act = async (k: MyConsent, fn: () => Promise<unknown>, okText: string) => {
    if (busy) return;
    setBusy(k.id); setMsg(null);
    try { await fn(); setMsg({ kind: 'ok', text: okText }); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string }).code === 'not_found' ? tr('এই অনুরোধটি আর নেই।', 'This request no longer exists.') : tr('কাজটি হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।', 'It did not work. Check the internet and try again.') }); }
    setBusy(null);
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.navigate('MyLeader')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('লিডার ও চুক্তি পাতায় ফিরে যান', 'Back to the Leader and contract page')}>
        <Text style={st.backT}>{tr('‹ লিডার ও চুক্তি', '‹ Leader and contract')}</Text>
      </Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('🔐 প্রশ্ন-উত্তর দেখার অনুমতি', '🔐 Permission to see your questions and answers')}</Text>
      <Text style={st.p}>{tr('লিডারের সাথে কোনো বিরোধ হলে, তা মেটাতে Travel Adda আপনার আর লিডারের প্রশ্ন-উত্তর দেখতে চাইতে পারে। আপনি রাজি না হলে কেউ তা দেখবে না।', 'If there is a dispute with the leader, Travel Adda may ask to see the questions and answers between you and the leader to settle it. If you do not agree, nobody will see them.')}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === undefined ? <ActivityIndicator color={C.primary} /> : null}
      {err ? <Notice kind="bad" title={tr('তথ্য আনা যায়নি', 'Could not load the information')} text={tr('ইন্টারনেট সংযোগ দেখে পাতাটি আবার খুলুন।', 'Check the internet connection and open the page again.')} /> : null}
      {rows && !rows.length && !err ? <Notice kind="ok" title={tr('এখন কোনো অনুরোধ নেই', 'No requests now')} /> : null}
      {(rows || []).map((k) => (
        <View key={k.id} style={st.card}>
          <Text style={st.val}>{tr('চুক্তি', 'Contract')} {k.contract_no} · {tr('লিডার', 'Leader')} {k.leader_name}</Text>
          <Text style={st.p}>{tr('কারণ', 'Reason')}: {k.reason}</Text>
          {k.status === 'asked' ? (
            <View>
              <Text style={st.p}>{tr('রাজি হলে Travel Adda ৭ দিন পর্যন্ত শুধু এই লিডারের সাথে আপনার প্রশ্ন-উত্তর পড়তে পারবে। যেকোনো সময় অনুমতি ফিরিয়ে নিতে পারবেন।', 'If you agree, Travel Adda can read your questions and answers with this leader only, for up to 7 days. You can take the permission back at any time.')}</Text>
              <Button title={tr('রাজি, দেখতে দিন', 'I agree, allow it')} icon="✅" loading={busy === k.id} onPress={() => act(k, () => respondConsent(k.id, true), tr('অনুমতি দেওয়া হয়েছে। ৭ দিন পর নিজে থেকেই বন্ধ হবে।', 'Permission given. It ends by itself after 7 days.'))} style={{ marginBottom: S.sm }} />
              <Button title={tr('রাজি নই', 'I do not agree')} icon="✖️" kind="secondary" disabled={busy === k.id} onPress={() => act(k, () => respondConsent(k.id, false), tr('আপনি রাজি হননি। কেউ আপনার প্রশ্ন-উত্তর দেখবে না।', 'You did not agree. Nobody will see your questions and answers.'))} />
            </View>
          ) : (
            <View>
              <Text style={[st.p, { color: C.ok, fontWeight: '700' }]}>{tr(`✅ আপনি অনুমতি দিয়েছেন — ${fmtDay(k.expires_at)} পর্যন্ত`, `✅ You gave permission until ${fmtDay(k.expires_at)}`)}</Text>
              <Button title={tr('অনুমতি ফিরিয়ে নিন', 'Take back permission')} icon="↩️" kind="danger" loading={busy === k.id}
                onPress={() => confirm(tr('অনুমতি ফিরিয়ে নেবেন?', 'Take back the permission?'), tr('এরপর Travel Adda আর আপনার প্রশ্ন-উত্তর দেখতে পারবে না।', 'After this Travel Adda can no longer see your questions and answers.'), tr('ফিরিয়ে নিন', 'Take back'),
                  () => act(k, () => revokeConsent(k.id), tr('অনুমতি ফিরিয়ে নেওয়া হয়েছে।', 'Permission taken back.')))} />
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
