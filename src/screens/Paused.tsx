import React, { useState } from 'react';
import { Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S } from '../theme';
import { Button, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { pushLogout } from '../lib/push';
import { resumeMyAccount, deleteDay } from '../lib/account';
import { st } from './GroupScreen';
import type { Me } from '../lib/me';

// 035: shown instead of the app while the person has paused his account (or asked for deletion).
// One main task: turn the account back on. Resuming also cancels a deletion request.
export default function Paused({ me, onChanged }: { me: Me; onChanged: () => Promise<unknown> }) {
  const ins = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'bad' | 'info'; text: string } | null>(null);
  const day = deleteDay(me.delete_after);
  const resume = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await resumeMyAccount();
      if (r === 'ok') { await onChanged(); return; }          // the app opens as before
      setMsg({ kind: 'info', text: 'অ্যাকাউন্ট আগেই চালু আছে। একটু অপেক্ষা করুন বা অ্যাপ আবার খুলুন।' }); await onChanged();
    } catch (e) { setMsg({ kind: 'bad', text: 'চালু করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন। আপনার অ্যাকাউন্ট আগের মতোই বন্ধ আছে।' }); }
    finally { setBusy(false); }
  };
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={[st.wrap, { paddingTop: ins.top + S.xl }]}>
      <Text style={st.title} accessibilityRole="header">⏸️ আপনার অ্যাকাউন্ট বন্ধ আছে</Text>
      {day ? (
        <Notice kind="warn" title={`অ্যাকাউন্টটি ${day} তারিখে মুছে যাবে`}
          text="আপনি অ্যাকাউন্ট মুছে ফেলার অনুরোধ করেছিলেন। মুছতে না চাইলে নিচের বাটন চাপুন। এতে মোছা বাতিল হবে এবং অ্যাকাউন্ট আবার চালু হবে।" />
      ) : (
        <Notice kind="info" title="আপনি নিজে অ্যাকাউন্টটি বন্ধ রেখেছেন"
          text="বন্ধ থাকা অবস্থায় আপনার নাম ও প্যাকেজ কেউ দেখতে পায় না, কোনো নোটিফিকেশনও আসে না। আপনার তথ্য মুছে যায়নি।" />
      )}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Button title={day ? 'মোছা বাতিল করে অ্যাকাউন্ট আবার চালু করুন' : 'অ্যাকাউন্ট আবার চালু করুন'} icon="▶️" onPress={resume} loading={busy} disabled={busy}
        style={{ marginBottom: S.md }} a11yHint="অ্যাপ আগের মতো খুলবে" />
      <Button title="লগআউট" icon="🚪" kind="secondary" onPress={async () => { await pushLogout(); supabase.auth.signOut().catch(() => {}); }} disabled={busy} />
      <Text style={[st.small, { marginTop: S.lg, color: C.muted }]}>অ্যাকাউন্ট বন্ধ থাকলেও লগইন করা যায়। যেকোনো সময় এই পাতা থেকে আবার চালু করতে পারবেন।</Text>
    </ScrollView>
  );
}
