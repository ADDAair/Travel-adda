import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { tr } from '../lib/lang';
import { areaText } from '../components/WorkAreaFields';
import { LEADER_KINDS } from '../lib/leaderKinds';
import { View, Text, Pressable, Linking, ActivityIndicator } from 'react-native';
import ScrollView from '../components/KbScroll';
import { C, S, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import { supabase } from '../lib/supabase';
import { adminApplications, reviewApplication, leaderDocUrl, notReady, telBd } from '../lib/groups';
import { adminCounts, countBadge, myPerms, PERMS, listComplaints, decideComplaint, evidenceUrl, listReports, handleReport, referralCancels, decideReferralCancel, findUsers, setUserStatus, userCounts, type UserCounts, listStaff, setStaff, setText, termsCounts, stats, exportCsv } from '../lib/admin';
import { getTerms } from '../lib/market';
import { signedAvatarUrl } from '../lib/avatar';
import { Image } from 'react-native';
import { st, errText, confirm, fmtDay, fmtTaka } from './GroupScreen';
import MoneyTab from './AdminMoney';
import { ContractsTab, GroupsTab, RatingsTab, UserPage, AppSettingsBox } from './AdminTools';
import NotifyTab from './AdminNotify';
import AdminMfa from './AdminMfa';
import ContentTab from './AdminContent';
import SpeedTab from './AdminSpeed';
import FundTab from './AdminFund';
import { MoneyAlertsTab, ServiceCostsTab, SegmentNotifyBox, SosTab, AuditSearchTab } from './AdminPart4';
import { AppState } from 'react-native';
import { idleExpired } from '../lib/idle';
import { filterOffers } from '../lib/offerRoute';
import { KIND, refOf, adminInterests, markInterest, hideOffer, adminOffersReview, reviewOffer, reviewOf, reviewLabel, getHelpline, setSetting, cleanHelpline } from '../lib/offers';
import { OfferCard } from '../components/OfferCard';
import type { Msg, Nav } from './navTypes';
import type { AnyPackage, Item, Res } from '../lib/types';
import { cleanCountMin, bnCount } from '../lib/counts';

type Evidence = { path: string; kind: string };   // a complaint's proof file (stored as JSON)

type Coded = { code?: string; message?: string } | null;
type Cb = { onDone: (t: string) => void; onFail: (t: string) => void };

const STATUS: Record<string, string> = { get pending() { return tr('⏳ যাচাই বাকি', '⏳ To check'); }, get approved() { return tr('✅ অনুমোদিত', '✅ Approved'); }, get rejected() { return tr('✖️ বাতিল', '✖️ Rejected'); } };

// Sections, each shown only to people with the matching permission ('admin' = the owner only).
// key in admin_counts() for the sections that have waiting work
const COUNT_KEY: Record<string, string> = { apps: 'apps', calls: 'calls', complaints: 'complaints', reports: 'reports', money: 'payments', offers: 'offers', alerts: 'money_alerts', sos: 'sos', fund: 'fund' };
const COUNT_TEXT: Record<string, string> = { get apps() { return tr('লিডার আবেদন যাচাই বাকি', 'Leader applications to check'); }, get calls() { return tr('হাজী ফোনের অপেক্ষায়', 'Hajis waiting for a call'); }, get complaints() { return tr('অভিযোগ যাচাই বাকি', 'Complaints to check'); }, get reports() { return tr('রিপোর্ট / রেফারেল বাতিলের অনুরোধ', 'Reports / referral cancel requests'); },
  get money() { return tr('টাকা জমা যাচাই বাকি', 'Payments to check'); }, get offers() { return tr('প্যাকেজ অনুমোদনের অপেক্ষায়', 'Packages waiting for approval'); },
  get alerts() { return tr('টাকার বকেয়া', 'Money owed'); }, get sos() { return tr('গত ২৪ ঘণ্টায় জরুরি ফোন', 'Emergency calls in the last 24 hours'); }, get fund() { return tr('সহায়তা তহবিলে যাচাই বাকি', 'Help fund items to check'); } };
type Section = { id: string; icon: string; label: string; perm: string | string[] };
const SECTIONS: Section[] = [
  { id: 'stats', icon: '📊', get label() { return tr('পরিসংখ্যান', 'Statistics'); }, perm: 'reports' },
  { id: 'apps', icon: '🧭', get label() { return tr('লিডার আবেদন', 'Leader applications'); }, perm: 'applications' },
  { id: 'calls', icon: '🙋', get label() { return tr('ফোনের অনুরোধ', 'Call requests'); }, perm: 'calls' },
  { id: 'complaints', icon: '🚩', get label() { return tr('অভিযোগ', 'Complaints'); }, perm: 'complaints' },
  { id: 'reports', icon: '📮', get label() { return tr('রিপোর্ট', 'Reports'); }, perm: 'reports' },
  { id: 'users', icon: '👥', get label() { return tr('ব্যবহারকারী', 'Users'); }, perm: 'users' },
  { id: 'notify', icon: '📣', get label() { return tr('নোটিফিকেশন পাঠান', 'Send notifications'); }, perm: 'notify' },
  { id: 'money', icon: '💳', get label() { return tr('টাকা ও কমিশন', 'Money and commission'); }, perm: 'payments' },
  { id: 'alerts', icon: '⏰', get label() { return tr('টাকার বকেয়া', 'Money owed'); }, perm: 'payments' },
  { id: 'services', icon: '🧾', get label() { return tr('নিজস্ব লিডারের সেবা-খরচ', 'Own leaders\' service costs'); }, perm: 'payments' },
  { id: 'sos', icon: '🆘', get label() { return tr('জরুরি রেকর্ড', 'Emergency records'); }, perm: 'users' },
  { id: 'fund', icon: '🤲', get label() { return tr('সহায়তা তহবিল', 'Help fund'); }, perm: ['users', 'payments'] },
  { id: 'offers', icon: '🎁', get label() { return tr('প্যাকেজ', 'Packages'); }, perm: 'offers' },
  { id: 'contracts', icon: '📄', get label() { return tr('চুক্তি ও বিরোধ', 'Contracts and disputes'); }, perm: ['payments', 'complaints', 'users'] },
  { id: 'groups', icon: '🧑‍🤝‍🧑', get label() { return tr('দল ও খাদেম', 'Groups and khadems'); }, perm: 'users' },
  { id: 'ratings', icon: '⭐', get label() { return tr('রেটিং মন্তব্য', 'Rating comments'); }, perm: 'complaints' },
  { id: 'staff', icon: '🪪', get label() { return tr('স্টাফ', 'Staff'); }, perm: 'admin' },
  { id: 'terms', icon: '📜', get label() { return tr('শর্তাবলি', 'Terms'); }, perm: 'admin' },
  { id: 'audit', icon: '🧾', get label() { return tr('কাজের রেকর্ড', 'Work log'); }, perm: 'admin' },
  { id: 'content', icon: '📝', get label() { return tr('গাইড ও দোয়ার লেখা', 'Guide and dua texts'); }, perm: 'admin' },
  { id: 'speed', icon: '⏱️', get label() { return tr('গতি পরীক্ষা', 'Speed test'); }, perm: 'admin' },
  { id: 'help', icon: '☎️', get label() { return tr('হেল্পলাইন ও অ্যাপ সেটিং', 'Helpline and app settings'); }, perm: 'admin' },
];

// Admin and staff (the database refuses everyone else).
export default function AdminScreen({ navigation }: { navigation: Nav }): JSX.Element {
  const [perms, setPerms] = useState<string[] | null>(null);
  const [state, setState] = useState<'mfa' | 'locked' | 'load' | 'ok' | 'soon' | 'denied' | 'err'>('mfa'); // 2FA first, then the menu
  const [tab, setTab] = useState<string | null>(null);
  // 15 minutes without use: ask for the 2FA code again (the open page stays where it was)
  const last = React.useRef(Date.now());
  const mfaDone = useCallback(() => { last.current = Date.now(); setState((s) => (s === 'locked' ? 'ok' : 'load')); }, []);
  useEffect(() => {
    const checkIdle = () => { if (idleExpired(last.current)) setState((s) => (s === 'ok' ? 'locked' : s)); };
    const t = setInterval(checkIdle, 30000);
    const sub = AppState.addEventListener('change', (a) => { if (a === 'active') checkIdle(); });
    return () => { clearInterval(t); sub.remove(); };
  }, []);
  useEffect(() => {
    if (state !== 'load') return;
    myPerms().then((p) => { setPerms(p); setState(p.length ? 'ok' : 'denied'); }).catch((e) => setState(notReady(e) ? 'soon' : 'err'));
  }, [state]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => { if (state === 'ok' && !tab) adminCounts().then((c) => setCounts({ ...c, fund: (c.help_apps || 0) + (c.donations || 0) + (c.donor_requests || 0) })).catch(() => {}); }, [state, tab]);
  const mine = SECTIONS.filter((x) => perms && ([] as string[]).concat(x.perm).some((p) => perms.includes(p)));
  const has = (p: string): boolean => !!perms && perms.includes(p);
  const todo = mine.filter((x) => counts[COUNT_KEY[x.id]] > 0);
  const cur = mine.find((x) => x.id === tab);
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled" onTouchStart={() => { last.current = Date.now(); }}>
      <Pressable onPress={() => (cur ? setTab(null) : navigation.navigate('Account'))} style={st.back} accessibilityRole="button" accessibilityLabel={cur ? tr('অ্যাডমিন মেনুতে ফিরে যান', 'Back to the admin menu') : tr('আমার তথ্য পাতায় ফিরে যান', 'Back to the My info page')}>
        <Text style={st.backT}>{cur ? tr('‹ অ্যাডমিন মেনু', '‹ Admin menu') : tr('‹ আমার তথ্য', '‹ My info')}</Text>
      </Pressable>
      <Text style={st.title} accessibilityRole="header">🛡️ {cur ? cur.label : tr('অ্যাডমিন', 'Admin')}</Text>
      {state === 'mfa' ? <AdminMfa onDone={mfaDone} /> : null}
      {state === 'locked' ? <><Notice kind="info" title={tr("🔒 ১৫ মিনিট ব্যবহার হয়নি, তাই অ্যাডমিন প্যানেল তালা দেওয়া হয়েছে", '🔒 Not used for 15 minutes, so the admin panel is locked')} /><AdminMfa again onDone={mfaDone} /></> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr("শীঘ্রই চালু হবে", 'Coming soon')} /> : null}
      {state === 'denied' ? <Notice kind="warn" title={tr("এই পাতা শুধু অ্যাডমিন ও স্টাফদের জন্য", 'This page is only for the admin and staff')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr("তথ্য আনা যায়নি", 'Could not load the information')} text={tr("ইন্টারনেট সংযোগ দেখে পাতাটি আবার খুলুন।", 'Check the internet connection and open the page again.')} /> : null}
      {state === 'ok' && !cur && todo.length ? (
        <Notice kind="warn" title={tr("📋 আজ যা করতে হবে", '📋 To do today')}>
          {todo.map((x) => (
            <Pressable key={x.id} onPress={() => setTab(x.id)} style={{ minHeight: TOUCH, justifyContent: 'center' }} accessibilityRole="button"
              accessibilityLabel={tr(`${COUNT_TEXT[x.id]}: ${toBn(counts[COUNT_KEY[x.id]])}টি। খুলতে চাপুন`, `${COUNT_TEXT[x.id]}: ${counts[COUNT_KEY[x.id]]}. Tap to open`)}>
              <Text style={[st.p, { fontWeight: '700', color: C.primary }]}>{x.icon} {COUNT_TEXT[x.id]}: {toBn(counts[COUNT_KEY[x.id]])}{tr('টি ›', ' ›')}</Text>
            </Pressable>
          ))}
        </Notice>
      ) : null}
      {state === 'ok' && !cur && !todo.length && Object.keys(counts).length ? <Notice kind="ok" title={tr("✅ এখন কোনো কাজ বাকি নেই", '✅ Nothing left to do now')} /> : null}
      {state === 'ok' && !cur ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
          {mine.map((x) => (
            <Pressable key={x.id} onPress={() => setTab(x.id)} style={({ pressed }) => [st.card, { width: '47%', minHeight: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 0 }, pressed && { opacity: 0.85 }]}
              accessibilityRole="button" accessibilityLabel={tr(`${countBadge(x.label, counts[COUNT_KEY[x.id]])} খুলুন`, `Open ${countBadge(x.label, counts[COUNT_KEY[x.id]])}`)}>
              <Text style={{ fontSize: 32 }} importantForAccessibility="no">{x.icon}</Text>
              <Text style={[st.val, { textAlign: 'center' }]}>{countBadge(x.label, counts[COUNT_KEY[x.id]])}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {cur && state === 'ok' ? (
        cur.id === 'stats' ? <StatsTab admin={has('admin')} />
          : cur.id === 'apps' ? <AppsTab />
            : cur.id === 'calls' ? <CallsTab />
              : cur.id === 'complaints' ? <ComplaintsTab />
                : cur.id === 'reports' ? <ReportsTab canUsers={has('users')} />
                  : cur.id === 'users' ? <UsersTab admin={has('admin')} />
                    : cur.id === 'money' ? <MoneyTab owner={has('admin')} />
                    : cur.id === 'notify' ? <><SegmentNotifyBox /><NotifyTab /></>
                    : cur.id === 'alerts' ? <MoneyAlertsTab />
                    : cur.id === 'services' ? <ServiceCostsTab />
                    : cur.id === 'sos' ? <SosTab />
                    : cur.id === 'fund' ? <FundTab perms={perms || []} />
                    : cur.id === 'offers' ? <OffersTab />
                    : cur.id === 'contracts' ? <ContractsTab />
                    : cur.id === 'groups' ? <GroupsTab />
                    : cur.id === 'ratings' ? <RatingsTab />
                      : cur.id === 'staff' ? <StaffTab />
                        : cur.id === 'terms' ? <TermsTab />
                          : cur.id === 'audit' ? <AuditSearchTab actionText={(a: string) => ACTION[a] || a} />
                          : cur.id === 'content' ? <ContentTab />
                          : cur.id === 'speed' ? <SpeedTab /> : <HelpTab />
      ) : null}
    </ScrollView>
  );
}

// Shared loader: 'load' | 'ok' | 'soon' | 'err', with a retry button.
function useLoad<T>(fn: () => Promise<T>) {
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');
  const [data, setData] = useState<T | null>(null);
  const load = useCallback(async () => {
    try { setData(await fn()); setState('ok'); } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, [fn]);
  useEffect(() => { load(); }, [load]);
  const gate = state === 'load' ? <ActivityIndicator color={C.primary} />
    : state === 'soon' ? <Notice kind="info" title={tr("শীঘ্রই চালু হবে", 'Coming soon')} text={tr("এই অংশের ডেটাবেস ধাপ এখনো চালানো হয়নি।", 'The database step for this part has not been run yet.')} />
      : state === 'err' ? <Notice kind="bad" title={tr("তথ্য আনা যায়নি", 'Could not load the information')}><Button title={tr("আবার চেষ্টা করুন", 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null;
  return { state, data, load, gate };
}

function AppsTab(): JSX.Element {
  const { state, data, load, gate } = useLoad(adminApplications);
  const [msg, setMsg] = useState<Msg>(null);
  const rows = data || [];
  const pending = rows.filter((r) => r.status === 'pending');
  const done = rows.filter((r) => r.status !== 'pending');
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <Notice kind="info" title={tr("অনুমোদনের আগে যাচাই করুন", 'Check before approving')} text={tr("ধর্ম মন্ত্রণালয়ের হজ এজেন্সির তালিকায় লাইসেন্স নম্বর মিলিয়ে দেখুন, আর আবেদনকারীকে ফোন করে নিশ্চিত হোন।", 'Match the licence number in the Ministry of Religious Affairs list of Hajj agencies, and call the applicant to make sure.')} />
          {pending.length === 0 ? <Notice kind="ok" title={tr("কোনো আবেদন বাকি নেই", 'No applications left')} /> : null}
          {pending.map((r) => <AppCard key={r.id} r={r} onDone={(t: string) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t: string) => setMsg({ kind: 'bad', text: t })} />)}
          {done.length ? <Text style={[st.h, { marginTop: S.md }]}>{tr('আগের সিদ্ধান্ত', 'Earlier decisions')}</Text> : null}
          {done.map((r) => (
            <View key={r.id} style={st.card}>
              <Text style={st.val}>{r.full_name} · {r.agency_name}</Text>
              <Text style={st.small}>{STATUS[r.status]} · {fmtDay(r.created_at)}{r.admin_note ? tr(` · নোট: ${r.admin_note}`, ` · Note: ${r.admin_note}`) : ''}</Text>
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

function CallsTab(): JSX.Element {
  const { state, data, load, gate } = useLoad(adminInterests);
  const [msg, setMsg] = useState<Msg>(null);
  const rows = data || [];
  const open = rows.filter((r) => r.status === 'new');
  const done = rows.filter((r) => r.status !== 'new');
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <Text style={st.small}>{tr('হাজীরা প্যাকেজ বা লিডারের প্রোফাইল দেখে "আমাকে ফোন করুন" চাপলে এখানে আসে। লিডার এই নাম-নম্বর দেখেন না। হাজী ও লিডারের সাথে কথা বলে মিটিংয়ের ব্যবস্থা করুন।', 'These come here when hajis tap "Call me" on a package or a leader\'s profile. The leader does not see this name and number. Talk to the haji and the leader and arrange a meeting.')}</Text>
          {open.length === 0 ? <Notice kind="ok" title={tr("কোনো অনুরোধ বাকি নেই", 'No requests left')} /> : null}
          {open.map((r) => <CallCard key={r.id} r={r} onDone={(t: string) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t: string) => setMsg({ kind: 'bad', text: t })} />)}
          {done.length ? <Text style={[st.h, { marginTop: S.md }]}>{tr('যাদের সাথে কথা হয়েছে', 'Already talked to')}</Text> : null}
          {done.map((r) => (
            <View key={r.id} style={st.card}>
              <Text style={st.val}>{r.full_name} · {toBn(r.phone)}</Text>
              <Text style={st.small}>{r.offer_id ? `${r.offer_title} (${refOf(r.offer_id)})` : tr(`লিডার: ${r.leader_name}`, `Leader: ${r.leader_name}`)} · {fmtDay(r.created_at)}{r.admin_note ? tr(` · নোট: ${r.admin_note}`, ` · Note: ${r.admin_note}`) : ''}</Text>
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

function CallCard({ r, onDone, onFail }: { r: Item<typeof adminInterests> } & Cb): JSX.Element {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const mark = () => confirm(tr('এই হাজীর সাথে কথা হয়েছে?', 'Have you talked to this haji?'), tr('অনুরোধটি "কথা হয়েছে" তালিকায় চলে যাবে।', 'The request will move to the "Talked to" list.'), tr('হ্যাঁ, কথা হয়েছে', 'Yes, talked'), async () => {
    setBusy(true);
    try { const res = await markInterest(r.id, note.trim()); onDone(res === 'ok' ? tr('চিহ্নিত করা হয়েছে।', 'Marked.') : tr('অনুরোধটি আর খোলা নেই (হয়তো হাজী বাতিল করেছেন)।', 'The request is no longer open (maybe the haji cancelled it).')); }
    catch (e) { onFail(errText(e)); setBusy(false); }
  });
  const tel = (n: string) => Linking.openURL(`tel:${telBd(n)}`).catch(() => {});
  return (
    <View style={[st.card, st.invite]}>
      <Text style={st.gName}>{r.full_name}</Text>
      <Text style={st.small}>{tr('আইডি:', 'ID:')} {r.haji_code} · {fmtDay(r.created_at)}</Text>
      <View style={st.cRow}><Text style={st.lbl}>{r.offer_id ? tr('প্যাকেজ', 'Package') : tr('কোন লিডারের ব্যাপারে', 'About which leader')}</Text><Text style={st.p}>{r.offer_id ? `${KIND[r.offer_kind]?.label} · ${r.offer_title} (${refOf(r.offer_id)}) · ${fmtTaka(r.price_bdt)}` : tr('লিডারের প্রোফাইল থেকে কথা বলতে চেয়েছেন', 'Wanted to talk from the leader\'s profile')}</Text></View>
      <View style={st.cRow}><Text style={st.lbl}>{tr('এজেন্সি ও লিডার', 'Agency and leader')}</Text><Text style={st.p}>{r.agency_name || '—'} · {r.leader_name} · {toBn(r.leader_phone)}</Text></View>
      <Button title={tr(`হাজীকে ফোন করুন (${toBn(r.phone)})`, `Call the haji (${r.phone})`)} icon="📞" onPress={() => tel(r.phone)} style={{ marginTop: S.sm }} />
      <Button title={tr(`লিডারকে ফোন করুন (${toBn(r.leader_phone)})`, `Call the leader (${r.leader_phone})`)} icon="📞" kind="secondary" onPress={() => tel(r.leader_phone)} style={{ marginTop: S.sm }} />
      <View style={{ marginTop: S.md }}>
        <Field label={tr("নোট (ইচ্ছা করলে)", 'Note (optional)')} hint={tr("যেমন: রবিবার অফিসে মিটিং", 'e.g. meeting at the office on Sunday')} value={note} onChangeText={setNote} maxLength={300} />
      </View>
      <Button title={tr("কথা হয়েছে", 'Talked')} icon="✅" kind="gold" onPress={mark} loading={busy} />
    </View>
  );
}

// Packages: waiting ones first. Approve, or send back with a reason (the leader fixes it). Any package can be hidden.
function OffersTab(): JSX.Element {
  const { state, data, load, gate } = useLoad(adminOffersReview);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [back, setBack] = useState<{ id: string; note: string } | null>(null);                 // { id, note } while writing a reason
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg(r === 'not_pending' ? { kind: 'info', text: tr('এটি আগেই সিদ্ধান্ত হয়ে গেছে। তালিকা নতুন করে আনা হলো।', 'This was already decided. The list has been loaded again.') } : { kind: 'ok', text: ok }); setBack(null); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Coded)?.code === 'reason' ? tr('ফেরত পাঠানোর কারণ লিখুন, যেন লিডার বুঝে ঠিক করতে পারেন।', 'Write why it is sent back, so the leader understands and can fix it.') : errText(e) }); }
    finally { setBusy(false); }
  };
  const approve = (o: AnyPackage) => confirm(tr('প্যাকেজটি অনুমোদন দেবেন?', 'Approve the package?'), tr('অনুমোদনের পর হাজীরা দেখবেন, আর লিডার দাম বা তথ্য বদলাতে পারবেন না।', 'After approval hajis will see it, and the leader cannot change the price or details.'), tr('হ্যাঁ, অনুমোদন দিন', 'Yes, approve'),
    () => act(() => reviewOffer(o.id, 'approve'), tr('অনুমোদন দেওয়া হয়েছে। লিডার নোটিফিকেশন পাবেন।', 'Approved. The leader will get a notification.')));
  const hide = (o: AnyPackage) => confirm(o.hidden_by_admin ? tr('প্যাকেজটি আবার দেখাবেন?', 'Show the package again?') : tr('প্যাকেজটি সবার কাছ থেকে লুকাবেন?', 'Hide the package from everyone?'), o.hidden_by_admin ? '' : tr('ভুল বা সন্দেহজনক তথ্য থাকলে লুকান। লিডার নিজে আর দেখাতে পারবেন না।', 'Hide it if it has wrong or doubtful information. The leader cannot show it again himself.'),
    o.hidden_by_admin ? tr('হ্যাঁ, দেখান', 'Yes, show') : tr('হ্যাঁ, লুকান', 'Yes, hide'), () => act(() => hideOffer(o.id, !o.hidden_by_admin), o.hidden_by_admin ? tr('আবার দেখানো হচ্ছে।', 'Being shown again.') : tr('লুকানো হয়েছে।', 'Hidden.')));
  const [find, setFind] = useState('');
  const all = data || [];
  const rows = find.trim() ? filterOffers(all, { q: find }) : all;
  const waiting = all.filter((o) => reviewOf(o) === 'pending').length;
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? <Notice kind={waiting ? 'warn' : 'ok'} title={waiting ? tr(`⏳ ${toBn(waiting)}টি প্যাকেজ অনুমোদনের অপেক্ষায়`, `⏳ ${waiting} package${waiting === 1 ? '' : 's'} waiting for approval`) : tr('অপেক্ষায় থাকা কোনো প্যাকেজ নেই', 'No packages waiting')} /> : null}
      {state === 'ok' && all.length ? <Field label={tr("লিডারের আইডি বা নাম দিয়ে খুঁজুন", 'Search by the leader\'s ID or name')} hint={tr("যেমন: TL-00004", 'e.g. TL-00004')} value={find} onChangeText={setFind} autoCapitalize="characters" autoCorrect={false} /> : null}
      {state === 'ok' && all.length === 0 ? <Notice kind="info" title={tr("এখনো কোনো প্যাকেজ নেই", 'No packages yet')} /> : null}
      {state === 'ok' && all.length > 0 && rows.length === 0 ? <Notice kind="info" title={tr("এই লিডারের কোনো প্যাকেজ পাওয়া যায়নি", 'No packages found for this leader')} /> : null}
      {state === 'ok' ? rows.map((o) => (
        <OfferCard key={o.id} o={o}>
          <View style={st.cRow}>
            {o.leader_name ? <Text style={st.p}>{tr('🧭 লিডার:', '🧭 Leader:')} {o.leader_name}{o.leader_code ? ` (${o.leader_code})` : ''}</Text> : null}
            <Text style={st.val}>{o.hidden_by_admin ? tr('⛔ আপনি লুকিয়েছেন', '⛔ Hidden by you') : reviewLabel(o) || (o.active ? tr('✅ অনুমোদিত, দেখা যাচ্ছে', '✅ Approved, being shown') : tr('🙈 লিডার লুকিয়েছেন', '🙈 Hidden by the leader'))}</Text>
            {reviewOf(o) === 'pending' ? (
              back && back.id === o.id ? (
                <>
                  <Field label={tr("ফেরত পাঠানোর কারণ (লিডার দেখবেন)", 'Reason for sending it back (the leader will see it)')} hint={tr("যেমন: মক্কার হোটেলের নাম দিন", 'e.g. give the name of the Makkah hotel')} value={back.note} onChangeText={(v: string) => setBack({ id: o.id, note: v })} multiline maxLength={300} editable={!busy} />
                  <Button title={tr("ফেরত পাঠান", 'Send back')} icon="↩️" kind="danger" onPress={() => act(() => reviewOffer(o.id, 'reject', back ? back.note : ''), tr('ফেরত পাঠানো হয়েছে। লিডার কারণসহ নোটিফিকেশন পাবেন।', 'Sent back. The leader will get a notification with the reason.'))} loading={busy} />
                  <Button title={tr("বাতিল", 'Cancel')} kind="secondary" onPress={() => setBack(null)} disabled={busy} style={{ marginTop: S.xs }} />
                </>
              ) : (
                <>
                  <Button title={tr("অনুমোদন দিন", 'Approve')} icon="✅" onPress={() => approve(o)} disabled={busy} style={{ marginTop: S.sm }} />
                  <Button title={tr("ঠিক করতে ফেরত পাঠান", 'Send back to fix')} icon="↩️" kind="secondary" onPress={() => { setMsg(null); setBack({ id: o.id, note: '' }); }} disabled={busy} style={{ marginTop: S.xs }} />
                </>
              )
            ) : null}
            <Button title={o.hidden_by_admin ? tr('আবার দেখান', 'Show again') : tr('সবার কাছ থেকে লুকান', 'Hide from everyone')} kind={o.hidden_by_admin ? 'secondary' : 'danger'} onPress={() => hide(o)} disabled={busy} style={{ marginTop: S.xs }} />
          </View>
        </OfferCard>
      )) : null}
    </>
  );
}

function HelpTab(): JSX.Element {
  const [phone, setPhone] = useState('');
  const [hours, setHours] = useState('');
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [otpLive, setOtpLive] = useState(false);
  useEffect(() => { getHelpline().then((h) => { setPhone(h.phone); setHours(h.hours); setOtpLive(!!h.otpLive); setState('ok'); }).catch((e) => setState(notReady(e) ? 'soon' : 'err')); }, []);
  const toggleOtp = () => confirm(otpLive ? tr('নম্বর যাচাই বাধ্যতামূলক বন্ধ করবেন?', 'Turn off required number checking?') : tr('নম্বর যাচাই বাধ্যতামূলক করবেন?', 'Make number checking required?'),
    otpLive ? tr('তখন যাচাই না করা নম্বরেও আমন্ত্রণ যাবে।', 'Then invitations will also go to unchecked numbers.') : tr('এরপর লিডারের আমন্ত্রণ শুধু যাচাই করা নম্বরে যাবে, আর লিডার আবেদনেও যাচাই করা নম্বর লাগবে। আগে নিজের নম্বর যাচাই করে দেখে নিন যে কোড আসছে।', 'After this, leaders\' invitations will go only to checked numbers, and leader applications will also need a checked number. First check your own number to see that the code arrives.'),
    otpLive ? tr('হ্যাঁ, বন্ধ করুন', 'Yes, turn off') : tr('হ্যাঁ, চালু করুন', 'Yes, turn on'), async () => {
      setBusy(true); setMsg(null);
      try {
        if (!otpLive) {
          const me = await supabase.from('profiles').select('phone_verified').single();
          if (me.error || !me.data?.phone_verified) { setMsg({ kind: 'warn', text: tr('আগে "আমার তথ্য" থেকে নিজের নম্বর যাচাই করুন। এতে নিশ্চিত হবে এসএমএস ঠিকমতো আসছে।', 'First check your own number from "My info". This makes sure the SMS arrives properly.') }); return; }
        }
        await setSetting('otp_live', otpLive ? '' : 'yes'); setOtpLive(!otpLive);
        setMsg({ kind: 'ok', text: otpLive ? tr('নম্বর যাচাই বাধ্যতামূলক বন্ধ করা হয়েছে।', 'Required number checking is turned off.') : tr('নম্বর যাচাই এখন বাধ্যতামূলক।', 'Number checking is now required.') });
      } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
      finally { setBusy(false); }
    });
  const save = async () => {
    if (busy) return;
    const p = cleanHelpline(phone);
    if (p && !/^\+?[0-9]{6,15}$/.test(p)) { setMsg({ kind: 'bad', text: tr('নম্বরটি ঠিক নেই। যেমন: +8801XXXXXXXXX', 'The number is not right. e.g. +8801XXXXXXXXX') }); return; }
    setBusy(true); setMsg(null);
    try { await setSetting('helpline_phone', p); await setSetting('helpline_hours', hours.trim()); setPhone(p); setMsg({ kind: 'ok', text: p ? tr('হেল্পলাইন সংরক্ষণ হয়েছে। সবার অ্যাপে এখন এই নম্বর দেখাবে।', 'Helpline saved. Everyone\'s app now shows this number.') : tr('হেল্পলাইন নম্বর সরানো হয়েছে।', 'Helpline number removed.') }); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };
  if (state === 'load') return <ActivityIndicator color={C.primary} />;
  if (state === 'soon') return <Notice kind="info" title={tr("শীঘ্রই চালু হবে", 'Coming soon')} text={tr("এই অংশের ডেটাবেস ধাপ এখনো চালানো হয়নি।", 'The database step for this part has not been run yet.')} />;
  if (state === 'err') return <Notice kind="bad" title={tr("তথ্য আনা যায়নি", 'Could not load the information')} />;
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Text style={[st.p, { marginBottom: S.md }]}>{tr('অফার পাতায় "হেল্পলাইনে ফোন করুন" বাটন এই নম্বরে কল করবে। দেশের কোডসহ লিখুন, যাতে সৌদি থেকেও কল যায়।', 'The "Call the helpline" button on the offers page calls this number. Write it with the country code, so it can be called from Saudi Arabia too.')}</Text>
      <Field label={tr("হেল্পলাইন নম্বর", 'Helpline number')} hint={tr("যেমন: +8801XXXXXXXXX", 'e.g. +8801XXXXXXXXX')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={16} />
      <Field label={tr("কখন ফোন ধরা হয় (ইচ্ছা করলে)", 'When calls are answered (optional)')} hint={tr("যেমন: প্রতিদিন সকাল ১০টা – রাত ৮টা", 'e.g. every day 10am – 8pm')} value={hours} onChangeText={setHours} maxLength={80} />
      <Button title={tr("সংরক্ষণ করুন", 'Save')} icon="💾" onPress={save} loading={busy} />
      <View style={[st.card, { marginTop: S.lg }]}>
        <Text style={st.h}>{tr('📱 এসএমএস কোডে নম্বর যাচাই', '📱 Number checking by SMS code')}</Text>
        <Text style={st.val}>{otpLive ? tr('✅ বাধ্যতামূলক চালু আছে', '✅ Required (on)') : tr('⏸️ বাধ্যতামূলক নয়', '⏸️ Not required')}</Text>
        <Text style={st.small}>{tr('চালু থাকলে লিডারের আমন্ত্রণ শুধু যাচাই করা নম্বরে যায়, আর লিডার আবেদনেও যাচাই করা নম্বর লাগে।', 'When on, leaders\' invitations go only to checked numbers, and leader applications also need a checked number.')}</Text>
        <Button title={otpLive ? tr('বাধ্যতামূলক বন্ধ করুন', 'Make it not required') : tr('বাধ্যতামূলক চালু করুন', 'Make it required')} kind={otpLive ? 'danger' : 'secondary'} onPress={toggleOtp} disabled={busy} style={{ marginTop: S.sm }} />
      </View>
      <AppSettingsBox />
    </>
  );
}

function AppCard({ r, onDone, onFail }: { r: Item<typeof adminApplications> } & Cb): JSX.Element {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = (approve: boolean) => confirm(approve ? tr(`${r.full_name}-কে লিডার হিসেবে অনুমোদন দেবেন?`, `Approve ${r.full_name} as a leader?`) : tr('আবেদনটি বাতিল করবেন?', 'Reject the application?'),
    approve ? tr('অনুমোদনের পর তিনি লিডার তালিকায় দেখা যাবেন, প্যাকেজ দিতে ও হাজীদের চুক্তি পাঠাতে পারবেন।', 'After approval they will be seen in the leader list and can add packages and send contracts to hajis.') : tr('আবেদনকারী আপনার নোট দেখতে পাবেন।', 'The applicant will see your note.'),
    approve ? tr('হ্যাঁ, অনুমোদন দিন', 'Yes, approve') : tr('হ্যাঁ, বাতিল করুন', 'Yes, reject'), async () => {
      setBusy(true);
      try {
        const res = await reviewApplication(r.id, approve, note.trim());
        if (res === 'ok') onDone(approve ? tr('অনুমোদন দেওয়া হয়েছে।', 'Approved.') : tr('আবেদন বাতিল করা হয়েছে।', 'Application rejected.'));
        else onDone(tr('এই আবেদনের সিদ্ধান্ত আগেই নেওয়া হয়েছে।', 'This application was already decided.'));
      } catch (e) { onFail(errText(e)); setBusy(false); }
    });
  const openDoc = async () => {
    try { await Linking.openURL(await leaderDocUrl(r.doc_path)); } catch (e) { onFail(tr('কাগজটি খোলা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।', 'Could not open the paper. Check the internet and try again.')); }
  };
  return (
    <View style={[st.card, st.invite]}>
      <Text style={st.gName}>{r.full_name}</Text>
      <Text style={st.small}>{tr('আইডি:', 'ID:')} {r.haji_code} {tr('· ফোন:', '· Phone:')} {toBn(r.phone)} · {fmtDay(r.created_at)}</Text>
      <View style={st.cRow}><Text style={st.lbl}>{tr('লিডারের ধরন', 'Kind of leader')}</Text><Text style={st.p}>{r.leader_kind === 'travel_adda' ? tr(`${LEADER_KINDS.travel_adda.icon} Travel Adda-র নিজস্ব লিডার (অফিস/লাইসেন্স নেই, NID দিয়েছেন)`, `${LEADER_KINDS.travel_adda.icon} Travel Adda's own leader (no office/licence, gave NID)`) : tr('🏢 নিজের এজেন্সি', '🏢 Own agency')}</Text></View>
      {r.profession ? <View style={st.cRow}><Text style={st.lbl}>{tr('পেশা', 'Profession')}</Text><Text style={st.p}>{r.profession}</Text></View> : null}
      {r.leader_kind === 'travel_adda' ? null : <View style={st.cRow}><Text style={st.lbl}>{tr('এজেন্সি', 'Agency')}</Text><Text style={st.p}>{r.agency_name}</Text></View>}
      {r.leader_kind === 'travel_adda' ? null : r.umrah_license || r.hajj_license ? (
        <>
          {r.umrah_license ? <View style={st.cRow}><Text style={st.lbl}>{tr('ওমরাহ লাইসেন্স', 'Umrah licence')}</Text><Text style={st.p} selectable>{r.umrah_license}</Text></View> : null}
          {r.hajj_license ? <View style={st.cRow}><Text style={st.lbl}>{tr('হজ লাইসেন্স', 'Hajj licence')}</Text><Text style={st.p} selectable>{r.hajj_license}</Text></View> : null}
        </>
      ) : <View style={st.cRow}><Text style={st.lbl}>{tr('লাইসেন্স নম্বর', 'Licence number')}</Text><Text style={st.p} selectable>{r.license_no}</Text></View>}
      {r.district ? <View style={st.cRow}><Text style={st.lbl}>{tr('কাজের এলাকা', 'Work area')}</Text><Text style={st.p}>{areaText(r)}</Text></View> : null}
      <Photo path={r.avatar_path} />
      <Button title={tr(`ফোন করুন (${toBn(r.phone)})`, `Call (${r.phone})`)} icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(r.phone)}`).catch(() => {})} style={{ marginTop: S.sm }} />
      {r.doc_path ? <Button title={r.leader_kind === 'travel_adda' ? tr('জাতীয় পরিচয়পত্রের ছবি দেখুন', 'See the national ID photo') : tr('জমা দেওয়া কাগজ দেখুন', 'See the papers sent')} icon={r.leader_kind === 'travel_adda' ? '🪪' : '📄'} kind="secondary" onPress={openDoc} style={{ marginTop: S.sm }} /> : <Text style={st.small}>{tr('কোনো কাগজ দেননি।', 'No papers sent.')}</Text>}
      <View style={{ marginTop: S.md }}>
        <Field label={tr("নোট (ইচ্ছা করলে)", 'Note (optional)')} hint={tr("যেমন: লাইসেন্স নম্বর মেলেনি", 'e.g. licence number did not match')} value={note} onChangeText={setNote} maxLength={500} />
      </View>
      <Button title={tr("অনুমোদন দিন", 'Approve')} icon="✅" onPress={() => decide(true)} loading={busy} />
      <Button title={tr("বাতিল করুন", 'Reject')} kind="danger" onPress={() => decide(false)} disabled={busy} style={{ marginTop: S.sm }} />
    </View>
  );
}

function Photo({ path }: { path?: string | null }): JSX.Element | null {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => { if (path) signedAvatarUrl(path).then(setU); }, [path]);
  return u ? <Image source={{ uri: u }} style={{ width: 96, height: 96, borderRadius: 48, marginTop: S.sm }} accessibilityLabel={tr("আবেদনকারীর ছবি", 'Applicant\'s photo')} /> : null;
}

const STAT_LABELS: [string, string][] = [
  ['hajis', 'হাজী অ্যাকাউন্ট'], ['leaders', 'অনুমোদিত লিডার'], ['leaders_pending', 'লিডার আবেদন বাকি'], ['suspended', 'বন্ধ অ্যাকাউন্ট'],   // i18n-ok: English in STAT_EN
  ['contracts_active', 'চালু চুক্তি'], ['contracts_sent', 'উত্তরের অপেক্ষায় চুক্তি'], ['contracts_completed', 'সম্পন্ন চুক্তি'], ['contracts_cancelled', 'বাতিল চুক্তি'],   // i18n-ok: English in STAT_EN
  ['complaints_pending', 'অভিযোগ যাচাই বাকি'], ['reports_new', 'নতুন রিপোর্ট'], ['calls_new', 'ফোনের অনুরোধ বাকি'], ['offers_visible', 'দেখানো প্যাকেজ'], ['offers_pending', 'অনুমোদনের অপেক্ষায় প্যাকেজ'], ['new_users_7d', 'গত ৭ দিনে নতুন অ্যাকাউন্ট'],   // i18n-ok: English in STAT_EN
  ['payments_pending', 'টাকার জমা যাচাই বাকি'], ['money_in', 'মোট পাওয়া টাকা'], ['money_out_leaders', 'লিডারদের দেওয়া'], ['money_refunded', 'হাজীদের ফেরত'],   // i18n-ok: English in STAT_EN
];
const STAT_EN: Record<string, string> = { hajis: 'Haji accounts', leaders: 'Approved leaders', leaders_pending: 'Leader applications waiting', suspended: 'Stopped accounts',
  contracts_active: 'Active contracts', contracts_sent: 'Contracts waiting for an answer', contracts_completed: 'Completed contracts', contracts_cancelled: 'Cancelled contracts',
  complaints_pending: 'Complaints to check', reports_new: 'New reports', calls_new: 'Call requests waiting', offers_visible: 'Packages shown', offers_pending: 'Packages waiting for approval',
  new_users_7d: 'New accounts in the last 7 days', payments_pending: 'Payments to check', money_in: 'Total money received', money_out_leaders: 'Paid to leaders', money_refunded: 'Refunded to hajis' };
const MONEY_STATS = ['money_in', 'money_out_leaders', 'money_refunded'];
function StatsTab({ admin }: { admin: boolean }): JSX.Element {
  const { state, data, gate } = useLoad(stats);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const dl = async (kind: string) => {
    setBusy(kind); setMsg(null);
    try { const n = await exportCsv(kind); setMsg({ kind: 'ok', text: tr(`${toBn(n)}টি সারি তৈরি হয়েছে। ফোনের মেনু থেকে সংরক্ষণ বা পাঠান (Excel-এ খোলে)।`, `${n} rows made. Save or send from the phone menu (opens in Excel).`) }); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(null); }
  };
  return (
    <>
      {gate}
      {state === 'ok' && data ? (
        <View style={st.card}>
          {STAT_LABELS.map(([k, l]) => <View key={k} style={[st.cRow, { flexDirection: 'row', justifyContent: 'space-between' }]}><Text style={st.p}>{tr(l, STAT_EN[k] || l)}</Text><Text style={st.val}>{MONEY_STATS.includes(k) ? fmtTaka(data[k] ?? 0) : toBn(data[k] ?? 0)}</Text></View>)}
        </View>
      ) : null}
      {admin ? (
        <View style={st.card}>
          <Text style={st.h}>{tr('⬇️ স্প্রেডশিট (Excel) ডাউনলোড', '⬇️ Download spreadsheet (Excel)')}</Text>
          <Text style={st.small}>{tr('এতে মোবাইল নম্বরসহ ব্যক্তিগত তথ্য থাকে; নিরাপদ জায়গায় রাখুন, কাউকে পাঠানোর আগে ভাবুন।', 'It holds personal information including mobile numbers; keep it safe and think before sending it to anyone.')}</Text>
          {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
          <Button title={tr("সব ব্যবহারকারী", 'All users')} icon="👥" kind="secondary" onPress={() => dl('users')} loading={busy === 'users'} disabled={!!busy} style={{ marginTop: S.sm }} />
          <Button title={tr("সব চুক্তি", 'All contracts')} icon="📜" kind="secondary" onPress={() => dl('contracts')} loading={busy === 'contracts'} disabled={!!busy} style={{ marginTop: S.sm }} />
          <Button title={tr("সব অভিযোগ", 'All complaints')} icon="🚩" kind="secondary" onPress={() => dl('complaints')} loading={busy === 'complaints'} disabled={!!busy} style={{ marginTop: S.sm }} />
          <Button title={tr("সব টাকা জমা", 'All payments')} icon="💳" kind="secondary" onPress={() => dl('payments')} loading={busy === 'payments'} disabled={!!busy} style={{ marginTop: S.sm }} />
          <Button title={tr("চুক্তিভিত্তিক হিসাব ও কমিশন", 'Accounts and commission by contract')} icon="📒" kind="secondary" onPress={() => dl('ledger')} loading={busy === 'ledger'} disabled={!!busy} style={{ marginTop: S.sm }} />
        </View>
      ) : null}
    </>
  );
}

function ComplaintsTab(): JSX.Element {
  const { state, data, load, gate } = useLoad(listComplaints);
  const [msg, setMsg] = useState<Msg>(null);
  const rows = data || [];
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <Text style={st.small}>{tr('যাচাই করলে অভিযোগের লেখা লিডারের প্রোফাইলে সবাই দেখবে (হাজীর নাম দেখাবে না)। আগে প্রমাণ দেখুন, দুপক্ষকে ফোন করুন।', 'If verified, everyone sees the complaint text on the leader\'s profile (the haji\'s name is not shown). First look at the proof and call both sides.')}</Text>
          {rows.filter((r) => r.status === 'pending').length === 0 ? <Notice kind="ok" title={tr("যাচাই বাকি এমন অভিযোগ নেই", 'No complaints to check')} /> : null}
          {rows.map((r) => <ComplaintCard key={r.id} r={r} onDone={(t: string) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t: string) => setMsg({ kind: 'bad', text: t })} />)}
        </>
      ) : null}
    </>
  );
}
function ComplaintCard({ r, onDone, onFail }: { r: Item<typeof listComplaints> } & Cb): JSX.Element {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const tel = (n: string) => Linking.openURL(`tel:${telBd(n)}`).catch(() => {});
  const open = async (f: Evidence) => { try { await Linking.openURL(await evidenceUrl(f.path)); } catch (e) { onFail(tr('ফাইলটি খোলা যায়নি।', 'Could not open the file.')); } };
  const decide = (v: boolean) => confirm(v ? tr('অভিযোগটি যাচাই করা হিসেবে প্রকাশ করবেন?', 'Publish the complaint as verified?') : tr('অভিযোগটি বাতিল করবেন?', 'Reject the complaint?'), v ? tr('লিডারের প্রোফাইলে সবাই দেখবেন।', 'Everyone will see it on the leader\'s profile.') : tr('হাজী আপনার নোট দেখবেন।', 'The haji will see your note.'), v ? tr('হ্যাঁ, প্রকাশ করুন', 'Yes, publish') : tr('হ্যাঁ, বাতিল', 'Yes, reject'), async () => {
    setBusy(true);
    try { const x = await decideComplaint(r.id, v, note.trim()); onDone(x === 'ok' ? (v ? tr('অভিযোগ যাচাই করা হিসেবে প্রকাশ হয়েছে।', 'The complaint was published as verified.') : tr('অভিযোগ বাতিল হয়েছে।', 'Complaint rejected.')) : tr('আগেই সিদ্ধান্ত নেওয়া হয়েছে।', 'Already decided.')); }
    catch (e) { onFail(errText(e)); setBusy(false); }
  });
  const pending = r.status === 'pending';
  return (
    <View style={[st.card, pending && st.invite]}>
      <Text style={st.small}>{fmtDay(r.created_at)} {tr('· চুক্তি', '· Contract')} {r.contract_no} · {pending ? tr('⏳ যাচাই বাকি', '⏳ To check') : r.status === 'verified' ? tr('✅ প্রকাশিত', '✅ Published') : tr('✖️ বাতিল', '✖️ Rejected')}</Text>
      <Text style={st.p} selectable>{r.body}</Text>
      <View style={st.cRow}><Text style={st.lbl}>{tr('হাজী', 'Haji')}</Text><Text style={st.p}>{r.haji_name} ({r.haji_code}){r.haji_phone ? ` · ${toBn(r.haji_phone)}` : ''}</Text></View>
      <View style={st.cRow}><Text style={st.lbl}>{tr('লিডার', 'Leader')}</Text><Text style={st.p}>{r.leader_name} ({r.leader_code}) · {toBn(r.leader_phone)}</Text></View>
      {((r.files || []) as Evidence[]).map((f, i) => <Button key={f.path} title={tr(`প্রমাণ ${toBn(i + 1)} দেখুন (${f.kind === 'image' ? 'ছবি' : f.kind === 'audio' ? 'অডিও' : 'ভিডিও'})`, `See proof ${i + 1} (${f.kind === 'image' ? 'photo' : f.kind === 'audio' ? 'audio' : 'video'})`)} icon="📎" kind="secondary" onPress={() => open(f)} style={{ marginTop: S.xs }} />)}
      {pending ? (
        <>
          {r.haji_phone ? <Button title={tr("হাজীকে ফোন করুন", 'Call the haji')} icon="📞" kind="secondary" onPress={() => tel(r.haji_phone)} style={{ marginTop: S.sm }} /> : null}
          <Button title={tr("লিডারকে ফোন করুন", 'Call the leader')} icon="📞" kind="secondary" onPress={() => tel(r.leader_phone)} style={{ marginTop: S.sm }} />
          <View style={{ marginTop: S.md }}><Field label={tr("নোট", 'Note')} hint={tr("যেমন: দুপক্ষের সাথে কথা হয়েছে", 'e.g. talked to both sides')} value={note} onChangeText={setNote} maxLength={500} /></View>
          <Button title={tr("যাচাই হয়েছে, প্রকাশ করুন", 'Verified, publish')} icon="✅" onPress={() => decide(true)} loading={busy} />
          <Button title={tr("প্রমাণ নেই, বাতিল করুন", 'No proof, reject')} kind="danger" onPress={() => decide(false)} disabled={busy} style={{ marginTop: S.sm }} />
        </>
      ) : r.admin_note ? <Text style={st.small}>{tr('নোট:', 'Note:')} {r.admin_note}</Text> : null}
    </View>
  );
}

const REASON: Record<string, string> = { get fraud() { return tr('প্রতারণা/টাকা', 'Fraud/money'); }, get abuse() { return tr('খারাপ ব্যবহার', 'Bad behaviour'); }, get fake() { return tr('ভুয়া তথ্য', 'False information'); }, get spam() { return tr('বিরক্তিকর', 'Annoying'); }, get other() { return tr('অন্য', 'Other'); } };
function ReportsTab({ canUsers }: { canUsers: boolean }): JSX.Element {
  const { state, data, load, gate } = useLoad(listReports);
  const [cancels, setCancels] = useState<Res<typeof referralCancels>>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (canUsers) referralCancels().then(setCancels).catch(() => {}); }, [canUsers, data]);
  const act = async (fn: () => Promise<unknown>, t: string) => { setBusy(true); setMsg(null); try { await fn(); setMsg({ kind: 'ok', text: t }); await load(); } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); } finally { setBusy(false); } };
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {canUsers && cancels.length ? <Text style={st.h}>{tr('🔑 রেফারেল বাতিলের অনুরোধ', '🔑 Referral cancel requests')}</Text> : null}
      {cancels.map((c) => (
        <View key={c.haji_id} style={[st.card, st.invite]}>
          <Text style={st.val}>{c.haji_name} ({c.haji_code}) → {c.leader_name} ({c.leader_code})</Text>
          <Text style={st.p}>{tr('কারণ:', 'Reason:')} {c.cancel_reason}</Text>
          <Text style={st.small}>{fmtDay(c.cancel_at)} {tr('· হাজীর ফোন', '· Haji\'s phone')} {toBn(c.haji_phone)}</Text>
          <Button title={tr("অনুমোদন দিন", 'Approve')} icon="✅" onPress={() => act(() => decideReferralCancel(c.haji_id, true), tr('রেফারেল বাতিল হয়েছে।', 'Referral cancelled.'))} disabled={busy} style={{ marginTop: S.sm }} />
          <Button title={tr("না", 'No')} kind="secondary" onPress={() => act(() => decideReferralCancel(c.haji_id, false), tr('অনুরোধ ফিরিয়ে দেওয়া হয়েছে।', 'Request declined.'))} disabled={busy} style={{ marginTop: S.sm }} />
        </View>
      ))}
      <Text style={st.h}>{tr('📮 ব্যবহারকারীর রিপোর্ট', '📮 User reports')}</Text>
      {gate}
      {state === 'ok' && (data || []).length === 0 ? <Notice kind="ok" title={tr("কোনো রিপোর্ট নেই", 'No reports')} /> : null}
      {state === 'ok' ? (data || []).map((r) => (
        <View key={r.id} style={[st.card, r.status === 'new' && st.invite]}>
          <Text style={st.small}>{fmtDay(r.created_at)} · {REASON[r.reason]} · {r.status === 'new' ? tr('নতুন', 'New') : tr('দেখা হয়েছে', 'Seen')}</Text>
          <Text style={st.val}>{r.target_name} ({r.target_code}) · {r.target_type === 'leader' ? tr('লিডার', 'Leader') : tr('হাজী', 'Haji')}{r.target_status === 'suspended' ? tr(' · বন্ধ', ' · stopped') : ''}</Text>
          <Text style={st.small}>{tr('রিপোর্ট করেছেন:', 'Reported by:')} {r.reporter_name} ({r.reporter_code})</Text>
          {r.details ? <Text style={st.p}>{r.details}</Text> : null}
          {r.status === 'new' ? <Button title={tr("দেখা হয়েছে", 'Seen')} icon="✅" kind="secondary" onPress={() => act(() => handleReport(r.id, null), tr('চিহ্নিত করা হয়েছে।', 'Marked.'))} disabled={busy} style={{ marginTop: S.sm }} /> : null}
          {canUsers && r.status === 'new' ? <Text style={st.small}>{tr('দরকার হলে "ব্যবহারকারী" অংশ থেকে', 'If needed, find')} {r.target_code} {tr('খুঁজে অ্যাকাউন্ট বন্ধ করুন।', 'in "Users" and stop the account.')}</Text> : null}
        </View>
      )) : null}
    </>
  );
}

// Short count at the top of ব্যবহারকারী: how many hajis registered, how many group leaders (031). Numbers only.
function UserCountsCard(): JSX.Element | null {
  const [c, setC] = useState<UserCounts | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { userCounts().then(setC).catch(() => setFailed(true)); }, []);
  if (failed) return <Text style={st.small}>{tr('মোট সংখ্যা আনা যায়নি। পাতাটি আবার খুলুন।', 'Could not load the totals. Open the page again.')}</Text>;
  if (!c) return null;          // loading, or database step 031 not run yet
  const label = tr(`অ্যাপে মোট ${bnCount(c.hajis)} জন হাজী নিবন্ধন করেছেন, গ্রুপ লিডার ${bnCount(c.leaders)} জন`, `In all ${c.hajis} hajis have registered in the app, and ${c.leaders} group leaders`)
    + (c.leadersPending ? tr(`, লিডার আবেদন অপেক্ষায় ${bnCount(c.leadersPending)}টি`, `, ${c.leadersPending} leader applications waiting`) : '');
  return (
    <View style={[st.card, { flexDirection: 'row', flexWrap: 'wrap', gap: S.md }]} accessible accessibilityLabel={label}>
      <View style={{ flex: 1, minWidth: 120 }}>
        <Text style={st.small}>{tr('🕋 নিবন্ধিত হাজী', '🕋 Registered hajis')}</Text>
        <Text style={st.h}>{bnCount(c.hajis)} {tr('জন', '')}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 120 }}>
        <Text style={st.small}>{tr('🧭 গ্রুপ লিডার', '🧭 Group leaders')}</Text>
        <Text style={st.h}>{bnCount(c.leaders)} {tr('জন', '')}</Text>
        {c.leadersPending ? <Text style={st.small}>{tr('⏳ আবেদন অপেক্ষায়:', '⏳ Applications waiting:')} {bnCount(c.leadersPending)}{tr('টি', '')}</Text> : null}
      </View>
    </View>
  );
}

// Admin only: show hajis "১২,০০০+ হাজী 'আমি হাজী' অ্যাপ ব্যবহার করছেন" on Home once the total reaches a minimum (032).
function HomeCountSetting(): JSX.Element {
  const [cur, setCur] = useState<string | null | undefined>(undefined);    // undefined = loading, '' = off
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    supabase.from('app_settings').select('key,value').eq('key', 'haji_count_min')
      .then((r) => { const x = (r.data || [])[0]?.value || ''; setCur(x); setV(x ? toBn(x) : ''); }, () => setCur(null));
  }, []);
  const save = (off: boolean) => {
    const c = off ? '' : cleanCountMin(v);
    if (c === null || (!off && c === '')) { setMsg({ kind: 'bad', text: tr('সংখ্যায় লিখুন, যেমন: ১০০০০ (১ থেকে ১০ কোটির মধ্যে)।', 'Write a number, e.g. 10000 (between 1 and 10 crore).') }); return; }
    confirm(off ? tr('হাজীদের হোম থেকে মোট সংখ্যা সরাবেন?', 'Remove the total from the hajis\' Home?') : tr('হাজীদের হোমে মোট সংখ্যা দেখাবেন?', 'Show the total on the hajis\' Home?'),
      off ? tr('হাজীরা আর এই লাইন দেখবেন না।', 'Hajis will no longer see this line.') : tr(`নিবন্ধিত হাজী ${bnCount(Number(c))} জন বা বেশি হলে সবার হোমে গোল করা সংখ্যা দেখাবে (যেমন "১২,০০০+")। ঠিক সংখ্যা কেউ দেখবেন না।`, `When registered hajis reach ${Number(c)} or more, everyone's Home shows a rounded number (e.g. "12,000+"). Nobody sees the exact number.`),
      off ? tr('হ্যাঁ, সরান', 'Yes, remove') : tr('হ্যাঁ, চালু করুন', 'Yes, turn on'), async () => {
        setBusy(true); setMsg(null);
        try { await setSetting('haji_count_min', c); setCur(c); setMsg({ kind: 'ok', text: off ? tr('বন্ধ করা হয়েছে।', 'Turned off.') : tr('চালু হয়েছে। হাজীরা পরের বার হোম খুললে দেখবেন।', 'Turned on. Hajis will see it the next time they open Home.') }); }
        catch (e) { setMsg({ kind: 'bad', text: notReady(e) ? tr('ডেটাবেস ধাপ ০৩২ এখনো চালানো হয়নি।', 'Database step 032 has not been run yet.') : errText(e) }); }   // the typed number stays
        finally { setBusy(false); }
      });
  };
  return (
    <View style={st.card}>
      <Text style={st.h}>{tr('🤝 হাজীদের হোমে মোট সংখ্যা', '🤝 Total on the hajis\' Home')}</Text>
      <Text style={st.small}>{cur === undefined ? tr('দেখা হচ্ছে…', 'Checking…') : cur === null ? tr('অবস্থা আনা যায়নি।', 'Could not load the state.') : cur ? tr(`চালু: হাজী ${bnCount(Number(cur))} জন বা বেশি হলে দেখায়`, `On: shown when there are ${Number(cur)} or more hajis`) : tr('বন্ধ: হাজীরা কোনো সংখ্যা দেখেন না', 'Off: hajis see no number')}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Field label={tr("কতজন হাজী হলে দেখাবে", 'Show it from how many hajis')} hint={tr("যেমন: ১০০০০", 'e.g. 10000')} value={v} onChangeText={setV} keyboardType="number-pad" maxLength={12} editable={!busy} />
      <Button title={cur ? tr('নতুন সংখ্যা সংরক্ষণ করুন', 'Save the new number') : tr('চালু করুন', 'Turn on')} icon="✅" onPress={() => save(false)} loading={busy} disabled={busy} />
      {cur ? <Button title={tr("বন্ধ করুন", 'Turn off')} icon="🚫" kind="secondary" onPress={() => save(true)} disabled={busy} style={{ marginTop: S.sm }} /> : null}
    </View>
  );
}

function UsersTab({ admin }: { admin: boolean }): JSX.Element {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Res<typeof findUsers> | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<string | null>(null);
  const search = async () => {
    if (q.trim().length < 3) { setMsg({ kind: 'bad', text: tr('অন্তত ৩ অক্ষর লিখুন (নাম, আইডি বা মোবাইল নম্বর)।', 'Write at least 3 letters (name, ID or mobile number).') }); return; }
    setBusy(true); setMsg(null);
    try { setRows(await findUsers(q.trim())); } catch (e) { setMsg({ kind: notReady(e) ? 'info' : 'bad', text: notReady(e) ? tr('শীঘ্রই চালু হবে।', 'Coming soon.') : errText(e) }); }
    finally { setBusy(false); }
  };
  const change = (u: Item<typeof findUsers>, status: 'suspended' | 'active') => {
    const why = (reason[u.id] || '').trim();
    if (why.length < 5) { setMsg({ kind: 'bad', text: tr('কারণ লিখুন (অন্তত ৫ অক্ষর)।', 'Write the reason (at least 5 letters).') }); return; }
    confirm(status === 'suspended' ? tr(`${u.full_name}-এর অ্যাকাউন্ট বন্ধ করবেন?`, `Stop ${u.full_name}'s account?`) : tr(`${u.full_name}-এর অ্যাকাউন্ট আবার চালু করবেন?`, `Turn ${u.full_name}'s account on again?`),
      status === 'suspended' ? tr('তিনি অ্যাপ ব্যবহার করতে পারবেন না; লিডার হলে তাঁর প্যাকেজও লুকিয়ে যাবে।', 'They will not be able to use the app; if a leader, their packages will be hidden too.') : '', status === 'suspended' ? tr('হ্যাঁ, বন্ধ করুন', 'Yes, stop') : tr('হ্যাঁ, চালু করুন', 'Yes, turn on'), async () => {
        setBusy(true); setMsg(null);
        try { const r = await setUserStatus(u.id, status, why); setMsg(r === 'ok' ? { kind: 'ok', text: tr('করা হয়েছে।', 'Done.') } : { kind: 'warn', text: tr('এই অ্যাকাউন্টে এটা করা যাবে না।', 'This cannot be done for this account.') }); await search(); }
        catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
        finally { setBusy(false); }
      });
  };
  if (detail) return <UserPage id={detail} onBack={() => setDetail(null)} />;
  return (
    <>
      <UserCountsCard />
      {admin ? <HomeCountSetting /> : null}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Field label={tr("নাম, আইডি বা মোবাইল নম্বর", 'Name, ID or mobile number')} hint={tr("যেমন: TL-00012 বা 01712", 'e.g. TL-00012 or 01712')} value={q} onChangeText={setQ} />
      <Button title={tr("খুঁজুন", 'Search')} icon="🔎" onPress={search} loading={busy} />
      {rows && rows.length === 0 ? <Notice kind="info" title={tr("কাউকে পাওয়া যায়নি", 'Nobody found')} /> : null}
      {(rows || []).map((u) => (
        <View key={u.id} style={[st.card, { marginTop: S.md }]}>
          <Text style={st.val}>{u.full_name} ({u.haji_code})</Text>
          <Text style={st.small}>{toBn(u.phone)} · {u.account_type === 'leader' ? tr('লিডার অ্যাকাউন্ট', 'Leader account') : tr('হাজী অ্যাকাউন্ট', 'Haji account')} {tr('· ভূমিকা:', '· Role:')} {u.role} · {u.status === 'active' ? tr('✅ চালু', '✅ On') : tr('⛔ বন্ধ', '⛔ Stopped')}</Text>
          <Button title={tr("পুরো বিবরণ দেখুন", 'See full details')} icon="📋" kind="secondary" onPress={() => setDetail(u.id)} style={{ marginVertical: S.xs }} />
          {u.role !== 'admin' ? (
            <>
              <Field label={tr("কারণ", 'Reason')} hint={tr("যেমন: একাধিক যাচাই করা অভিযোগ", 'e.g. several verified complaints')} value={reason[u.id] || ''} onChangeText={(v: string) => setReason((x) => ({ ...x, [u.id]: v }))} maxLength={300} />
              {u.status === 'active'
                ? <Button title={tr("অ্যাকাউন্ট বন্ধ করুন", 'Stop the account')} icon="⛔" kind="danger" onPress={() => change(u, 'suspended')} disabled={busy} />
                : <Button title={tr("আবার চালু করুন", 'Turn on again')} icon="✅" kind="secondary" onPress={() => change(u, 'active')} disabled={busy} />}
            </>
          ) : null}
        </View>
      ))}
    </>
  );
}

function StaffTab(): JSX.Element {
  const { state, data, load, gate } = useLoad(listStaff);
  const [phone, setPhone] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const save = (ph: string, perms: string[]) => confirm(perms.length ? tr('এই স্টাফকে এই অধিকারগুলো দেবেন?', 'Give these rights to this staff member?') : tr('এই স্টাফের সব অধিকার সরিয়ে দেবেন?', 'Remove all rights of this staff member?'), perms.map((x) => PERMS.find((p) => p.id === x)?.label).join(', '), tr('হ্যাঁ', 'Yes'), async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await setStaff(ph, perms);
      setMsg(r === 'ok' ? { kind: 'ok', text: tr('সংরক্ষণ হয়েছে।', 'Saved.') } : r === 'not_found' ? { kind: 'bad', text: tr('এই নম্বরে কোনো অ্যাকাউন্ট নেই। আগে স্টাফকে অ্যাপে হাজী অ্যাকাউন্ট খুলতে বলুন।', 'No account with this number. First ask the staff member to open a haji account in the app.') } : { kind: 'bad', text: tr('এই অ্যাকাউন্টকে স্টাফ বানানো যাবে না (লিডার বা অ্যাডমিন)।', 'This account cannot be made staff (leader or admin).') });
      if (r === 'ok') { setPhone(''); setSel([]); }
      await load();
    } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  });
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <View style={st.card}>
        <Text style={st.h}>{tr('➕ স্টাফ যোগ / অধিকার বদলান', '➕ Add staff / change rights')}</Text>
        <Text style={st.small}>{tr('স্টাফ আগে অ্যাপে সাধারণ (হাজী) অ্যাকাউন্ট খুলবেন। তারপর তাঁর নম্বর লিখে কাজ বেছে দিন।', 'The staff member first opens a normal (haji) account in the app. Then write their number and choose the work.')}</Text>
        <Field label={tr("স্টাফের মোবাইল নম্বর", 'Staff member\'s mobile number')} hint={tr("যেমন: 01712345678", 'e.g. 01712345678')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={11} />
        {PERMS.map((p) => (
          <Pressable key={p.id} onPress={() => setSel((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))} style={{ minHeight: 48, justifyContent: 'center' }}
            accessibilityRole="checkbox" accessibilityState={{ checked: sel.includes(p.id) }}>
            <Text style={st.p}>{sel.includes(p.id) ? '☑️' : '⬜'} {p.label}</Text>
          </Pressable>
        ))}
        <Button title={tr("সংরক্ষণ করুন", 'Save')} icon="💾" onPress={() => { if (!/^01[3-9]\d{8}$/.test(phone.trim())) { setMsg({ kind: 'bad', text: tr('সঠিক ১১ সংখ্যার নম্বর লিখুন।', 'Write a correct 11-digit number.') }); return; } if (!sel.length) { setMsg({ kind: 'bad', text: tr('অন্তত একটি কাজ বাছুন।', 'Choose at least one task.') }); return; } save(phone.trim(), sel); }} loading={busy} />
      </View>
      {gate}
      {state === 'ok' && (data || []).length === 0 ? <Notice kind="info" title={tr("এখনো কোনো স্টাফ নেই", 'No staff yet')} /> : null}
      {state === 'ok' ? (data || []).map((u) => (
        <View key={u.user_id} style={st.card}>
          <Text style={st.val}>{u.full_name} · {toBn(u.phone)}</Text>
          <Text style={st.small}>{u.perms.map((x: string) => PERMS.find((p) => p.id === x)?.label).join(', ')}</Text>
          <Button title={tr("অধিকার বদলান", 'Change rights')} kind="secondary" onPress={() => { setPhone(u.phone); setSel(u.perms); }} disabled={busy} style={{ marginTop: S.sm }} />
          <Button title={tr("স্টাফ থেকে সরান", 'Remove from staff')} kind="danger" onPress={() => save(u.phone, [])} disabled={busy} style={{ marginTop: S.sm }} />
        </View>
      )) : null}
    </>
  );
}

function TermsTab(): JSX.Element {
  const [kind, setKind] = useState<'haji' | 'leader'>('haji');
  const [body, setBody] = useState('');
  const [key, setKey] = useState<string | null>(null);             // which stored text was loaded ('terms' = the old single text)
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [state, setState] = useState<'load' | 'ok'>('load');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setState('load'); setMsg(null);
    try { const t = await getTerms(kind); setBody(t ? t.body : ''); setKey(t ? t.key : null); } catch (e) { setBody(''); }
    termsCounts().then((r) => setCounts(Object.fromEntries(r.map((x) => [x.key, x.agreed])))).catch(() => setCounts({}));
    setState('ok');
  }, [kind]);
  useEffect(() => { load(); }, [load]);
  const name = kind === 'leader' ? tr('লিডারদের শর্তাবলি', 'Terms for leaders') : tr('হাজীদের শর্তাবলি', 'Terms for hajis');
  const k = kind === 'leader' ? 'terms_leader' : 'terms_haji';
  const save = () => confirm(tr(`${name} সংরক্ষণ করবেন?`, `Save ${name}?`), tr(`সবার অ্যাপে সঙ্গে সঙ্গে বদলে যাবে। যাঁরা আগের লেখা মেনে নিয়েছিলেন, তাঁদের "শর্তাবলি" পাতায় নতুনটি মেনে নিতে বলা হবে।`, `It changes at once in everyone's app. Those who accepted the earlier text will be asked to accept the new one on the "Terms" page.`), tr('হ্যাঁ, সংরক্ষণ', 'Yes, save'), async () => {
    setBusy(true); setMsg(null);
    try { await setText(k, body.trim()); setMsg({ kind: 'ok', text: body.trim() ? tr(`${name} সংরক্ষণ হয়েছে।`, `${name} saved.`) : tr(`${name} সরানো হয়েছে।`, `${name} removed.`) }); setKey(body.trim() ? k : null); }
    catch (e) { setMsg({ kind: 'bad', text: notReady(e) || /bad key/.test(String((e as Coded)?.message)) ? tr('হাজী ও লিডারের আলাদা শর্তাবলির ডেটাবেস ধাপ (০১২) এখনো চালানো হয়নি।', 'The database step (012) for separate terms for hajis and leaders has not been run yet.') : errText(e) }); }   // text stays in the box
    finally { setBusy(false); }
  });
  return (
    <>
      <Segmented value={kind} onChange={(v: 'haji' | 'leader') => { if (!busy) setKind(v); }} options={[{ id: 'haji', label: tr('হাজীদের', 'Hajis\'') }, { id: 'leader', label: tr('লিডারদের', 'Leaders\'') }]} />
      <View style={{ height: S.md }} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : (
        <>
          <Notice kind="warn" title={tr("আইনি লেখা", 'Legal text')} text={tr("প্রথম খসড়া অ্যাপের নিয়ম মিলিয়ে লেখা হয়েছে। প্রকাশের আগে একজন আইনজীবীকে দিয়ে দেখিয়ে নিন। এখানে যা লিখবেন, অ্যাপে হুবহু তাই দেখাবে।", 'The first draft was written to match the app\'s rules. Have a lawyer check it before publishing. What you write here is shown in the app exactly.')} />
          {key === 'terms' ? <Notice kind="info" title={tr("এখন পুরোনো একক শর্তাবলি দেখানো হচ্ছে", 'The old single terms are being shown now')} text={tr(`সংরক্ষণ করলে এটি শুধু ${name} হিসেবে থাকবে।`, `If you save, it will be kept only as ${name}.`)} /> : null}
          {counts[k] != null ? <Text style={[st.small, { marginBottom: S.sm }]}>{tr('বর্তমান লেখাটি মেনে নিয়েছেন:', 'Accepted the current text:')} {toBn(counts[k])} {tr('জন', '')}</Text> : null}
          <Field label={tr(`${name}র পুরো লেখা`, `Full text: ${name}`)} value={body} onChangeText={setBody} multiline maxLength={20000} />
          <Button title={tr("সংরক্ষণ করুন", 'Save')} icon="💾" onPress={save} loading={busy} />
        </>
      )}
    </>
  );
}

const ACTION: Record<string, string> = { get approve_leader() { return tr('লিডার অনুমোদন', 'Leader approved'); }, get reject_leader() { return tr('লিডার আবেদন বাতিল', 'Leader application rejected'); }, get complaint_verified() { return tr('অভিযোগ প্রকাশ', 'Complaint published'); }, get complaint_rejected() { return tr('অভিযোগ বাতিল', 'Complaint rejected'); },
  get report_handled() { return tr('রিপোর্ট দেখা', 'Report seen'); }, get suspend_user() { return tr('অ্যাকাউন্ট বন্ধ', 'Account stopped'); }, get reactivate_user() { return tr('অ্যাকাউন্ট চালু', 'Account turned on'); }, get staff_set() { return tr('স্টাফের অধিকার', 'Staff rights'); }, get staff_removed() { return tr('স্টাফ সরানো', 'Staff removed'); },
  get referral_cancel_ok() { return tr('রেফারেল বাতিল অনুমোদন', 'Referral cancel approved'); }, get referral_cancel_no() { return tr('রেফারেল বাতিল নাকচ', 'Referral cancel declined'); }, get call_done() { return tr('ফোনের অনুরোধ শেষ', 'Call request done'); }, get offer_approved() { return tr('প্যাকেজ অনুমোদন', 'Package approved'); }, get offer_rejected() { return tr('প্যাকেজ ফেরত', 'Package sent back'); }, get offer_hidden() { return tr('প্যাকেজ লুকানো', 'Package hidden'); }, get offer_shown() { return tr('প্যাকেজ দেখানো', 'Package shown'); },
  get text_terms() { return tr('শর্তাবলি বদল', 'Terms changed'); }, get export_users() { return tr('ব্যবহারকারী ডাউনলোড', 'Users downloaded'); }, get export_contracts() { return tr('চুক্তি ডাউনলোড', 'Contracts downloaded'); }, get export_complaints() { return tr('অভিযোগ ডাউনলোড', 'Complaints downloaded'); },
  get service_cost_added() { return tr('সেবা-খরচ লেখা', 'Service cost written'); }, get service_cost_deleted() { return tr('সেবা-খরচ মোছা', 'Service cost deleted'); }, get notify_segment() { return tr('নির্দিষ্ট অংশকে নোটিফিকেশন', 'Notification to a segment'); }, get chat_viewed() { return tr('প্রশ্ন-উত্তর দেখা', 'Questions and answers viewed'); },
  get chat_consent_asked() { return tr('প্রশ্ন-উত্তর দেখার অনুমতি চাওয়া', 'Asked permission to view questions and answers'); }, get content_edit() { return tr('গাইড/দোয়ার লেখা বদল', 'Guide/dua text changed'); }, get user_viewed() { return tr('ব্যবহারকারীর বিবরণ দেখা', 'User details viewed'); }, get contract_note() { return tr('চুক্তিতে নোট', 'Note on a contract'); },
  get payout_leader() { return tr('লিডারকে টাকা', 'Money to leader'); }, get payout_haji() { return tr('হাজীকে ফেরত', 'Refund to haji'); }, get payment_confirmed() { return tr('টাকা জমা নিশ্চিত', 'Payment confirmed'); }, get payment_rejected() { return tr('টাকা জমা বাতিল', 'Payment rejected'); } };
