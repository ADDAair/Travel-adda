import React, { useEffect, useState } from 'react';
import { Text, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S } from '../theme';
import { Button, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { getHelpline } from '../lib/offers';
import { pushLogout } from '../lib/push';
import { st } from './GroupScreen';
import { resumeMyAccount, deleteDay } from '../lib/account';
import type { Me } from '../lib/me';

// Shown instead of the app when the admin has suspended this account.
export default function Suspended({ me, onChanged }: { me?: Me | null; onChanged?: () => Promise<unknown> }) {
  const ins = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const day = deleteDay(me?.delete_after);
  // 035: a suspended person may have asked for deletion; he can cancel only that (the suspension stays)
  const cancelDelete = async () => {
    if (busy) return; setBusy(true);
    try { await resumeMyAccount(); await onChanged?.(); } catch (e) { /* stays as it is; the notice still shows */ } finally { setBusy(false); }
  };
  const [help, setHelp] = useState<{ phone: string } | null>(null);
  useEffect(() => { getHelpline().then(setHelp).catch(() => {}); }, []);
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={[st.wrap, { paddingTop: ins.top + S.xl }]}>
      <Text style={st.title} accessibilityRole="header">⛔ অ্যাকাউন্ট বন্ধ আছে</Text>
      <Notice kind="warn" title="Travel Adda অ্যাডমিন আপনার অ্যাকাউন্টটি বন্ধ রেখেছেন" text="কারণ জানতে বা আবার চালু করতে হেল্পলাইনে যোগাযোগ করুন। আপনার তথ্য মুছে ফেলা হয়নি।" />
      {me && me.delete_after ? (
        <Notice kind="warn" title={`অ্যাকাউন্টটি ${day} তারিখে মুছে যাবে`} text="আপনি অ্যাকাউন্ট মুছে ফেলার অনুরোধ করেছিলেন। মুছতে না চাইলে নিচের বাটন চাপুন।">
          <Button title="মোছা বাতিল করুন" icon="↩️" kind="secondary" onPress={cancelDelete} loading={busy} disabled={busy} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}
      {help && help.phone ? <Button title="হেল্পলাইনে ফোন করুন" icon="📞" onPress={() => Linking.openURL(`tel:${help.phone}`).catch(() => {})} style={{ marginBottom: S.md }} /> : null}
      <Button title="লগআউট" icon="🚪" kind="danger" onPress={async () => { await pushLogout(); supabase.auth.signOut().catch(() => {}); }} />
    </ScrollView>
  );
}
