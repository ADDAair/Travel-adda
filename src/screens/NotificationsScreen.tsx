import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { tr } from '../lib/lang';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice } from '../components/ui';
import { toBn } from '../lib/phone';
import { notReady } from '../lib/groups';
import { KIND_ICON, listNotifications, markRead, hideNotification, markAllRead } from '../lib/notifications';
import { st, errText, confirm, fmtWhen } from './GroupScreen';
import PushCard from '../components/PushCard';
import type { Msg, Nav } from './navTypes';
import type { NotificationRow } from '../lib/types';

// Notification box: everything Travel Adda or the app told this person, newest first.
export default function NotificationsScreen({ navigation }: { navigation: Nav }) {
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [state, setState] = useState('load');   // load | ok | soon | err
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    try { const r = await listNotifications(); setRows(r.rows); setOffline(r.offline); setState('ok'); }
    catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const open = async (n: NotificationRow) => {
    setRows((x) => (x || []).map((y) => (y.id === n.id ? { ...y, is_read: true } : y)));
    markRead(n).catch(() => {});
    if (n.route) navigation.navigate(n.route);
  };
  const remove = (n: NotificationRow) => confirm(tr('নোটিফিকেশনটি মুছে ফেলবেন?', 'Delete this notification?'), '', tr('হ্যাঁ, মুছুন', 'Yes, delete'), async () => {
    try { await hideNotification(n); setRows((x) => (x || []).filter((y) => y.id !== n.id)); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
  });
  const readAll = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await markAllRead(); setRows((x) => (x || []).map((y) => ({ ...y, is_read: true }))); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };

  const fresh = (rows || []).filter((n) => !n.is_read);
  const old = (rows || []).filter((n) => n.is_read);
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}><Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('🔔 নোটিফিকেশন', '🔔 Notifications')}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'ok' ? <PushCard /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} style={{ marginTop: S.lg }} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই চালু হবে', 'Coming soon')} text={tr('Travel Adda-র নোটিশ ও আপনার চুক্তি, টাকা, দলের খবর এখানে আসবে।', 'Travel Adda notices and news about your contract, money and group will come here.')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('নোটিফিকেশন আনা যায়নি', 'Could not get notifications')} text={tr('ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'Check the internet connection and try again.')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {offline ? <Notice kind="warn" title={tr('ইন্টারনেট নেই', 'No internet')} text={tr('ফোনে রাখা আগের নোটিফিকেশন দেখানো হচ্ছে।', 'Showing the notifications saved on the phone.')} /> : null}
      {state === 'ok' && (rows || []).length === 0 ? <Notice kind="info" title={tr('এখনো কোনো নোটিফিকেশন নেই', 'No notifications yet')} text={tr('Travel Adda কোনো নোটিশ দিলে বা আপনার চুক্তি, টাকা ও দলের কোনো খবর এলে এখানে দেখাবে।', 'Travel Adda notices and news about your contract, money and group will show here.')} /> : null}
      {state === 'ok' && fresh.length ? (
        <View style={n.headRow}>
          <Text style={n.head}>{tr('নতুন', 'New')} ({toBn(fresh.length)})</Text>
          <Pressable onPress={readAll} disabled={busy} style={n.allBtn} accessibilityRole="button" accessibilityLabel={tr('সব নোটিফিকেশন পড়া হয়েছে হিসেবে চিহ্নিত করুন', 'Mark all notifications as read')}>
            <Text style={n.allT}>{tr('✓ সব পড়া হয়েছে', '✓ All read')}</Text>
          </Pressable>
        </View>
      ) : null}
      {fresh.map((x) => <Item key={`${x.source}${x.id}`} n={x} onOpen={open} onRemove={remove} />)}
      {state === 'ok' && old.length ? <Text style={[n.head, { marginTop: S.md }]}>{tr('আগের', 'Earlier')}</Text> : null}
      {old.map((x) => <Item key={`${x.source}${x.id}`} n={x} onOpen={open} onRemove={remove} />)}
    </ScrollView>
  );
}

function Item({ n: x, onOpen, onRemove }: { n: NotificationRow; onOpen: (n: NotificationRow) => void; onRemove: (n: NotificationRow) => void }) {
  const isNew = !x.is_read;
  return (
    <View style={[n.card, isNew && n.cardNew, x.important && isNew && n.cardImp]}>
      <Pressable onPress={() => onOpen(x)} style={n.row} accessibilityRole="button"
        accessibilityLabel={`${isNew ? tr('নতুন। ', 'New. ') : ''}${x.important ? tr('জরুরি। ', 'Urgent. ') : ''}${x.title}. ${x.body || ''} ${fmtWhen(x.created_at)}${x.route ? tr('। খুলতে চাপুন', '. Tap to open') : ''}`}>
        <View style={[n.icon, isNew && { backgroundColor: C.accentSoft }]}><Text style={{ fontSize: 24 }} importantForAccessibility="no">{KIND_ICON[x.kind] || '🔔'}</Text></View>
        <View style={{ flex: 1 }}>
          <View style={n.tags}>
            {isNew ? <Text style={n.newTag}>{tr('● নতুন', '● New')}</Text> : null}
            {x.important ? <Text style={n.impTag}>{tr('⚠️ জরুরি', '⚠️ Urgent')}</Text> : null}
            {x.source === 'all' ? <Text style={n.fromTag}>Travel Adda</Text> : null}
          </View>
          <Text style={[n.title, isNew && { color: C.primary }]}>{x.title}</Text>
          {x.body ? <Text style={n.body} selectable>{x.body}</Text> : null}
          <Text style={n.time}>{fmtWhen(x.created_at)}{x.route ? tr('  ·  খুলুন ›', '  ·  Open ›') : ''}</Text>
        </View>
      </Pressable>
      <Pressable onPress={() => onRemove(x)} style={n.del} accessibilityRole="button" accessibilityLabel={tr(`${x.title} মুছুন`, `Delete ${x.title}`)}>
        <Text style={n.delT}>{tr('মুছুন', 'Delete')}</Text>
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
  newTag: { fontSize: F.small, color: C.primary, fontWeight: '800' },
  impTag: { fontSize: F.small, color: C.bad, fontWeight: '800' },
  fromTag: { fontSize: F.small, color: C.muted, fontWeight: '700' },
  title: { fontSize: F.large, fontWeight: '700', color: C.text, lineHeight: 28 },
  body: { fontSize: F.body, color: C.text, lineHeight: 27, marginTop: 2 },
  time: { fontSize: F.small, color: C.muted, marginTop: S.xs },
  del: { alignSelf: 'flex-end', minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.md },
  delT: { fontSize: F.small, color: C.bad, fontWeight: '700' },
});
