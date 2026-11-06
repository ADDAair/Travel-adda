import React, { useEffect, useState } from 'react';
import { Text, ScrollView, Linking } from 'react-native';
import { tr } from '../lib/lang';
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
      <Text style={st.title} accessibilityRole="header">{tr('⛔ অ্যাকাউন্ট বন্ধ আছে', '⛔ Account is closed')}</Text>
      <Notice kind="warn" title={tr('Travel Adda অ্যাডমিন আপনার অ্যাকাউন্টটি বন্ধ রেখেছেন', 'The Travel Adda admin has closed your account')} text={tr('কারণ জানতে বা আবার চালু করতে হেল্পলাইনে যোগাযোগ করুন। আপনার তথ্য মুছে ফেলা হয়নি।', 'Contact the helpline to know why or to open it again. Your data has not been deleted.')} />
      {me && me.delete_after ? (
        <Notice kind="warn" title={tr(`অ্যাকাউন্টটি ${day} তারিখে মুছে যাবে`, `The account will be deleted on ${day}`)} text={tr('আপনি অ্যাকাউন্ট মুছে ফেলার অনুরোধ করেছিলেন। মুছতে না চাইলে নিচের বাটন চাপুন।', 'You asked to delete the account. If you do not want that, tap the button below.')}>
          <Button title={tr('মোছা বাতিল করুন', 'Cancel the deletion')} icon="↩️" kind="secondary" onPress={cancelDelete} loading={busy} disabled={busy} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}
      {help && help.phone ? <Button title={tr('হেল্পলাইনে ফোন করুন', 'Call the helpline')} icon="📞" onPress={() => Linking.openURL(`tel:${help.phone}`).catch(() => {})} style={{ marginBottom: S.md }} /> : null}
      <Button title={tr('লগআউট', 'Log out')} icon="🚪" kind="danger" onPress={async () => { await pushLogout(); supabase.auth.signOut().catch(() => {}); }} />
    </ScrollView>
  );
}
