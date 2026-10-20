// Admin & staff tools (supabase/007_marketplace.sql). Each function is refused by the database unless the caller
// has the matching permission; staff only see the parts the admin gave them.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';

const check = (r) => { if (r.error) throw r.error; return r.data; };
const rpc = async (fn, args) => check(await supabase.rpc(fn, args));

export const PERMS = [
  { id: 'applications', label: 'লিডার আবেদন যাচাই' },
  { id: 'calls', label: 'ফোনের অনুরোধ' },
  { id: 'offers', label: 'প্যাকেজ লুকানো/দেখানো' },
  { id: 'complaints', label: 'অভিযোগ যাচাই' },
  { id: 'reports', label: 'রিপোর্ট ও পরিসংখ্যান' },
  { id: 'users', label: 'ব্যবহারকারী বন্ধ/চালু, রেফারেল বাতিল' },
  { id: 'payments', label: 'টাকা জমা যাচাই, কমিশন ও লিডারকে টাকা' },
  { id: 'notify', label: 'নোটিফিকেশন পাঠানো' },
];

export async function myPerms() {
  try { return (await rpc('my_perms')) || []; } catch (e) {
    // step 007 not run yet: fall back to the old "admin only" rule
    const p = await supabase.from('profiles').select('role').single();
    if (p.error) throw e;
    return p.data.role === 'admin' ? ['admin', 'applications', 'calls', 'offers'] : [];
  }
}
export const listComplaints = async () => (await rpc('admin_list_complaints')) || [];
export const decideComplaint = (id, verify, note) => rpc('admin_decide_complaint', { p_id: id, p_verify: verify, p_note: note || null });
export async function evidenceUrl(path) {
  const { data, error } = await supabase.storage.from('complaint-evidence').createSignedUrl(path, 300);
  if (error || !data) throw error || new Error('no url');
  return data.signedUrl;
}
export const listReports = async () => (await rpc('admin_list_reports')) || [];
export const handleReport = (id, note) => rpc('admin_handle_report', { p_id: id, p_note: note || null });
export const referralCancels = async () => (await rpc('admin_referral_cancels')) || [];
export const decideReferralCancel = (hajiId, ok, note) => rpc('admin_decide_referral_cancel', { p_haji: hajiId, p_approve: ok, p_note: note || null });
export const findUsers = async (q) => (await rpc('admin_find_users', { p_query: q })) || [];
export const setUserStatus = (id, status, reason) => rpc('admin_set_user_status', { p_user: id, p_status: status, p_reason: reason });
export const listStaff = async () => (await rpc('admin_list_staff')) || [];
export const setStaff = (phone, perms) => rpc('admin_set_staff', { p_phone: phone, p_perms: perms });
export const listAudit = async () => (await rpc('admin_list_audit')) || [];
export const setText = (key, body) => rpc('admin_set_text', { p_key: key, p_body: body });
export const termsCounts = async () => (await rpc('admin_terms_counts')) || [];
export const stats = () => rpc('admin_stats');

// Spreadsheet (CSV that Excel opens, Bengali-safe) shared with the phone's own menu. Returns the row count.
export async function exportCsv(kind) {
  const rows = (await rpc('admin_export', { p_kind: kind })) || [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  if (Platform.OS === 'web') return rows.length;
  const path = `${FileSystem.cacheDirectory}travel-adda-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'স্প্রেডশিট সংরক্ষণ বা পাঠান' });
  return rows.length;
}
