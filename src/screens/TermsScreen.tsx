import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { tr, getLang } from '../lib/lang';
import { C, S } from '../theme';
import { Button, Notice, Segmented } from '../components/ui';
import { getTerms, agreeTerms, myTermsStatus, type TermsText } from '../lib/market';
import type { Res } from '../lib/types';
import { useMe, isLeaderAccount } from '../lib/me';
import { st, fmtDay, errText } from './GroupScreen';
import type { Msg, Nav } from './navTypes';

// Terms & conditions written by the admin (can change any time without a new app version).
// Two texts: for hajis and for leaders. Opens on the one for this account; the other can be read too.
export default function TermsScreen({ navigation }: { navigation: Nav }) {
  const { me } = useMe();
  const mine = isLeaderAccount(me) ? 'leader' : 'haji';
  const [kind, setKind] = useState<'haji' | 'leader'>(mine);
  const [t, setT] = useState<TermsText | null | undefined>(undefined);            // undefined = loading, null = none written
  const [status, setStatus] = useState<Res<typeof myTermsStatus>>(null);       // { haji: { at, current }, leader: {...} }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { setKind(mine); }, [mine]);

  const load = useCallback(async () => {
    setT(undefined); setMsg(null);
    getTerms(kind).then(setT).catch(() => setT(null));
    myTermsStatus().then(setStatus).catch(() => setStatus(null));
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const agree = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await agreeTerms(kind);
      if (r === 'ok') { setMsg({ kind: 'ok', text: tr('ধন্যবাদ। আপনার সম্মতি সংরক্ষণ হয়েছে।', 'Thank you. Your agreement is saved.') }); setStatus(await myTermsStatus().catch(() => status)); }
      else setMsg({ kind: 'info', text: tr('এখন সম্মতি দেওয়ার কিছু নেই।', 'There is nothing to agree to now.') });
    } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };

  const s = status ? status[kind] : null;
  const name = kind === 'leader' ? tr('লিডারদের শর্তাবলি', 'Terms for leaders') : tr('হাজীদের শর্তাবলি', 'Terms for hajis');
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.navigate('Account')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('আমার তথ্য পাতায় ফিরে যান', 'Back to the My info page')}><Text style={st.backT}>{tr('‹ আমার তথ্য', '‹ My info')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('📜 শর্তাবলি', '📜 Terms')}</Text>
      <Segmented value={kind} onChange={setKind} options={[{ id: 'haji', label: tr('হাজীদের জন্য', 'For hajis') }, { id: 'leader', label: tr('লিডারদের জন্য', 'For leaders') }]} />
      <View style={{ height: S.md }} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {t === undefined ? <ActivityIndicator color={C.primary} /> : null}
      {t === null ? <Notice kind="info" title={tr('শর্তাবলি শীঘ্রই যুক্ত হবে', 'The terms will be added soon')} /> : null}
      {t && kind === mine && s && s.current ? <Notice kind="ok" title={tr(`আপনি ${fmtDay(s.at)} তারিখে এই শর্তাবলি মেনে নিয়েছেন।`, `You accepted these terms on ${fmtDay(s.at)}.`)} /> : null}
      {t && kind === mine && s && !s.current ? (
        <Notice kind="warn" title={tr('শর্তাবলি বদলেছে', 'The terms have changed')} text={tr('আপনি আগের শর্তাবলি মেনে নিয়েছিলেন। নিচে নতুনটি পড়ে মেনে নিন।', 'You accepted the earlier terms. Read the new ones below and accept them.')} />
      ) : null}
      {t ? (
        <View style={st.card}>
          <Text style={st.small}>{name} · {tr('সর্বশেষ হালনাগাদ', 'Last updated')}: {fmtDay(t.updated_at)}</Text>
          {getLang() === 'en' ? <Notice kind="info" title="The terms are in Bengali for now" text="An English version is coming soon. The Bengali text below is the one that counts." /> : null}
          <Text style={[st.p, { marginTop: S.sm, lineHeight: 30 }]} selectable>{t.body}</Text>
        </View>
      ) : null}
      {t && kind === mine && status && (!s || !s.current) ? (
        <Button title={tr('পড়েছি, মেনে নিচ্ছি', 'I have read and accept')} icon="✅" onPress={agree} loading={busy} style={{ marginBottom: S.xl }} />
      ) : null}
    </ScrollView>
  );
}
