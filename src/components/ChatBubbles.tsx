import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, F, S, R } from '../theme';
import { toBn } from '../lib/phone';
import { roleLabel } from '../lib/help';

const BN_MONTH = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
// "২৪ অক্টোবর, ১০:০৫" (24-hour clock: no AM/PM confusion)
export function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0'); const mm = String(d.getMinutes()).padStart(2, '0');
  return `${toBn(d.getDate())} ${BN_MONTH[d.getMonth()]}, ${toBn(hh)}:${toBn(mm)}`;
}

// One conversation. "mineSide" = messages written by the person looking at the screen sit on the right.
// Who wrote each message is said in words with an icon (never colour only).
export default function ChatBubbles({ rows, viewer }) {
  return (
    <View>
      {(rows || []).map((m) => {
        const right = m.mine;
        const who = viewer === 'haji' ? roleLabel(m.sender_role, m.mine) : (m.mine ? '✍️ আপনি' : roleLabel(m.sender_role));
        const name = m.mine || !m.sender_name ? '' : ` · ${m.sender_name}`;
        return (
          <View key={m.id} style={[b.row, right ? b.right : b.left]}
            accessible accessibilityLabel={`${who}${name}। ${m.body}। ${fmtWhen(m.created_at)}`}>
            <View style={[b.bubble, right ? b.mine : m.sender_role === 'haji' ? b.haji : b.staff]}>
              <Text style={b.who}>{who}{name}</Text>
              <Text style={b.body} selectable>{m.body}</Text>
              <Text style={b.time}>{fmtWhen(m.created_at)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const b = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: S.sm },
  right: { justifyContent: 'flex-end' },
  left: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '88%', borderRadius: R.lg, padding: S.md, borderWidth: 1 },
  mine: { backgroundColor: C.primarySoft, borderColor: C.primary },
  staff: { backgroundColor: C.card, borderColor: C.gold },
  haji: { backgroundColor: C.card, borderColor: C.line },
  who: { fontSize: F.small, fontWeight: '700', color: C.primary, marginBottom: 2 },
  body: { fontSize: F.body, color: C.text, lineHeight: F.body * 1.5 },
  time: { fontSize: F.small, color: C.muted, marginTop: 4, textAlign: 'right' },
});
