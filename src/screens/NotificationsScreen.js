import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice } from '../components/ui';
import { toBn } from '../lib/phone';
import { notReady } from '../lib/groups';
import { KIND_ICON, listNotifications, markRead, hideNotification, markAllRead } from '../lib/notifications';
import { st, errText, confirm, fmtWhen } from './GroupScreen';
import PushCard from '../components/PushCard';

// Notification box: everything Travel Adda or the app told this person, newest first.
export default function NotificationsScreen({ navigation }) {
  const [rows, setRows] = useState(null);
  const [state, setState] = useState('load');   // load | ok | soon | err
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try { const r = await listNotifications(); setRows(r.rows); setOffline(r.offline); setState('ok'); }
    catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const open = async (n) => {
    setRows((x) => x.map((y) => (y.id === n.id ? { ...y, is_read: true } : y)));
    markRead(n).catch(() => {});
    if (n.route) navigation.navigate(n.route);
  };
  const remove = (n) => confirm('নোটিফিকেশনটি মুছে ফেলবেন?', '', 'হ্যাঁ, মুছুন', async () => {
    try { await hideNotification(n); setRows((x) => x.filter((y) => y.id !== n.id)); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
  });
  const readAll = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await markAllRead(); setRows((x) => x.map((y) => ({ ...y, is_read: true }))); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };

  const fresh = (rows || []).filter((n) => !n.is_read);
  const old = (rows || []).filter((n) => n.is_read);
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান"><Text style={st.backT}>‹ হোম</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">🔔 নোটিফিকেশন</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'ok' ? <PushCard /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} style={{ marginTop: S.lg }} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" text="Travel Adda-র নোটিশ ও আপনার চুক্তি, টাকা, দলের খবর এখানে আসবে।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="নোটিফিকেশন আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {offline ? <Notice kind="warn" title="ইন্টারনেট নেই" text="ফোনে রাখা আগের নোটিফিকেশন দেখানো হচ্ছে।" /> : null}
      {state === 'ok' && rows.length === 0 ? <Notice kind="info" title="এখনো কোনো নোটিফিকেশন নেই" text="Travel Adda কোনো নোটিশ দিলে বা আপনার চুক্তি, টাকা ও দলের কোনো খবর এলে এখানে দেখাবে।" /> : null}
      {state === 'ok' && fresh.length ? (
        <View style={n.headRow}>
          <Text style={n.head}>নতুন ({toBn(fresh.length)})</Text>
          <Pressable onPress={readAll} disabled={busy} style={n.allBtn} accessibilityRole="button" accessibilityLabel="সব নোটিফিকেশন পড়া হয়েছে হিসেবে চিহ্নিত করুন">
            <Text style={n.allT}>✓ সব পড়া হয়েছে</Text>
          </Pressable>
        </View>
      ) : null}
      {fresh.map((x) => <Item key={`${x.source}${x.id}`} n={x} onOpen={open} onRemove={remove} />)}
      {state === 'ok' && old.length ? <Text style={[n.head, { marginTop: S.md }]}>আগের</Text> : null}
      {old.map((x) => <Item key={`${x.source}${x.id}`} n={x} onOpen={open} onRemove={remove} />)}
    </ScrollView>
  );
}

function Item({ n: x, onOpen, onRemove }) {
  const isNew = !x.is_read;
  return (
    <View style={[n.card, isNew && n.cardNew, x.important && isNew && n.cardImp]}>
      <Pressable onPress={() => onOpen(x)} style={n.row} accessibilityRole="button"
        accessibilityLabel={`${isNew ? 'নতুন। ' : ''}${x.important ? 'জরুরি। ' : ''}${x.title}। ${x.body || ''} ${fmtWhen(x.created_at)}${x.route ? '। খুলতে চাপুন' : ''}`}>
        <View style={[n.icon, isNew && { backgroundColor: C.accentSoft }]}><Text style={{ fontSize: 24 }} importantForAccessibility="no">{KIND_ICON[x.kind] || '🔔'}</Text></View>
        <View style={{ flex: 1 }}>
          <View style={n.tags}>
            {isNew ? <Text style={n.newTag}>● নতুন</Text> : null}
            {x.important ? <Text style={n.impTag}>⚠️ জরুরি</Text> : null}
            {x.source === 'all' ? <Text style={n.fromTag}>Travel Adda</Text> : null}
          </View>
          <Text style={[n.title, isNew && { color: C.primary }]}>{x.title}</Text>
          {x.body ? <Text style={n.body} selectable>{x.body}</Text> : null}
          <Text style={n.time}>{fmtWhen(x.created_at)}{x.route ? '  ·  খুলুন ›' : ''}</Text>
        </View>
      </Pressable>
      <Pressable onPress={() => onRemove(x)} style={n.del} accessibilityRole="button" accessibilityLabel={`${x.title} মুছুন`}>
        <Text style={n.delT}>মুছুন</Text>
      </Pressable>
    </View>
  );
}

const n = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: S.xs },
  head: { fontSize: F.large, fontWeight: '700', color: C.text, marginBottom: S.xs },
  allBtn: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.sm },
  allT: { fontSize: F.body, color: C.primary, fontWeight: '700' },
  card: { backgroundColor: C.card, borderRadius: R.lg, marginBottom: S.sm, borderWidth: 1, borderColor: C.line, ...shadow },
  cardNew: { borderColor: C.accent, borderWidth: 2 },
  cardImp: { backgroundColor: C.accentSoft },
  row: { flexDirection: 'row', padding: S.md, paddingBottom: S.xs, gap: S.sm },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: S.xs, marginBottom: 2 },
  newTag: { fontSize: F.small, color: C.accent, fontWeight: '800' },
  impTag: { fontSize: F.small, color: C.bad, fontWeight: '800' },
  fromTag: { fontSize: F.small, color: C.muted, fontWeight: '700' },
  title: { fontSize: F.large, fontWeight: '700', color: C.text, lineHeight: 28 },
  body: { fontSize: F.body, color: C.text, lineHeight: 27, marginTop: 2 },
  time: { fontSize: F.small, color: C.muted, marginTop: S.xs },
  del: { alignSelf: 'flex-end', minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.md },
  delT: { fontSize: F.small, color: C.bad, fontWeight: '700' },
});
