// Shown above a page that is using the copy saved on this phone (offline step 1): no internet (or the server could
// not be reached), when the copy was saved (the caller formats it, e.g. with fmtWhen), and that doing something new
// needs internet.
import React, { type JSX } from 'react';
import { View } from 'react-native';
import { tr } from '../lib/lang';
import { Notice } from './ui';

export function offlineText(when: string): { title: string; text: string } {
  return {
    title: tr('📶 ইন্টারনেট নেই বা দুর্বল', '📶 No internet or a weak connection'),
    text: tr(`শেষ হালনাগাদ: ${when}। তখনকার তথ্য দেখানো হচ্ছে। নতুন কিছু করতে (রাজি হওয়া, টাকা জমা, অভিযোগ) ইন্টারনেট লাগবে।`,
      `Last updated: ${when}. The details from then are shown. To do anything new (agree, send money, complain) you need internet.`),
  };
}

export function OfflineNote({ when }: { when: string }): JSX.Element {
  const t = offlineText(when);
  return (
    <View accessible accessibilityLabel={`${t.title}. ${t.text}`}>
      <Notice kind="warn" title={t.title} text={t.text} />
    </View>
  );
}
