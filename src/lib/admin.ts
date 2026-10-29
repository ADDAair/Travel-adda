// Admin & staff tools (supabase/007_marketplace.sql). Each function is refused by the database unless the caller
// has the matching permission; staff only see the parts the admin gave them.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';
import { toBn } from './phone';
import { rpc, fail } from './rpc';

type Row = Record<string, unknown>;
const list = async (fn: string, args?: Record<string, unknown>): Promise<Row[]> => (await rpc<Row[]>(fn, args)) || [];

export const PERMS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'applications', label: 'লিডার আবেদন যাচাই' },
  { id: 'calls', label: 'ফোনের অনুরোধ' },
  { id: 'offers', label: 'প্যাকেজ লুকানো/দেখানো' },
  { id: 'complaints', label: 'অভিযোগ যাচাই' },
  { id: 'reports', label: 'রিপোর্ট ও পরিসংখ্যান' },
  { id: 'users', label: 'ব্যবহারকারী বন্ধ/চালু, রেফারেল বাতিল' },
  { id: 'payments', label: 'টাকা জমা যাচাই, কমিশন ও লিডারকে টাকা' },
  { id: 'notify', label: 'নোটিফিকেশন পাঠানো' },
];

export async function myPerms(): Promise<string[]> {
  try { return (await rpc<string[]>('my_perms')) || []; } catch (e) {
    // step 007 not run yet: fall back to the old "admin only" rule
    const p = await supabase.from('profiles').select('role').single();
    if (p.error) throw e;
    return (p.data as { role?: string } | null)?.role === 'admin' ? ['admin', 'applications', 'calls', 'offers'] : [];
  }
}
export const listComplaints = () => list('admin_list_complaints');
export const decideComplaint = (id: string, verify: boolean, note?: string | null) => rpc('admin_decide_complaint', { p_id: id, p_verify: verify, p_note: note || null });
export async function evidenceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('complaint-evidence').createSignedUrl(path, 300);
  if (error || !data) throw error || new Error('no url');
  return data.signedUrl;
}
export const listReports = () => list('admin_list_reports');
export const handleReport = (id: string, note?: string | null) => rpc('admin_handle_report', { p_id: id, p_note: note || null });
export const referralCancels = () => list('admin_referral_cancels');
export const decideReferralCancel = (hajiId: string, ok: boolean, note?: string | null) => rpc('admin_decide_referral_cancel', { p_haji: hajiId, p_approve: ok, p_note: note || null });
export const findUsers = (query: string) => list('admin_find_users', { p_query: query });
export const setUserStatus = (id: string, status: string, reason: string) => rpc('admin_set_user_status', { p_user: id, p_status: status, p_reason: reason });
export const listStaff = () => list('admin_list_staff');
export const setStaff = (phone: string, perms: string[]) => rpc('admin_set_staff', { p_phone: phone, p_perms: perms });
export const listAudit = () => list('admin_list_audit');
export const setText = (key: string, body: string | null) => rpc('admin_set_text', { p_key: key, p_body: body });
export const termsCounts = () => list('admin_terms_counts');
export const stats = () => rpc<Record<string, number | string> | null>('admin_stats');

// Spreadsheet (CSV that Excel opens, Bengali-safe) shared with the phone's own menu. Returns the row count.
export async function exportCsv(kind: string): Promise<number> {
  const rows = await list('admin_export', { p_kind: kind });
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const cell = (v: unknown): string => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  if (Platform.OS === 'web') return rows.length;
  const path = `${FileSystem.cacheDirectory}travel-adda-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'স্প্রেডশিট সংরক্ষণ বা পাঠান' });
  return rows.length;
}

// ---------- 022: contracts & disputes, user page, pending counts, rating comments, unlisting, videos, groups ----------
const need5 = (t: unknown): string => { const v = String(t || '').trim(); if (v.length < 5) throw fail('short'); return v; };
const q = (v: unknown): string | null => (String(v || '').trim() || null);
export const findContracts = (query: unknown) => list('admin_find_contracts', { p_query: String(query || '').trim() });
export const contractDetail = (id: string) => rpc<Row>('admin_contract_detail', { p_id: id });
export const addContractNote = async (id: string, note: unknown) => rpc<string>('admin_add_contract_note', { p_id: id, p_note: need5(note) });
export const userDetail = (id: string) => rpc<Row>('admin_user_detail', { p_user: id });
export const adminCounts = async (): Promise<Record<string, number>> => (await rpc<Record<string, number>>('admin_counts')) || {};
export const listRatings = (query: unknown) => list('admin_list_ratings', { p_query: q(query) });
export const hideRating = async (contractId: string, hide: boolean, reason: unknown) => rpc('admin_hide_rating', { p_contract: contractId, p_hide: !!hide, p_reason: need5(reason) });
export const setLeaderListed = async (userId: string, listed: boolean, reason: unknown) => rpc('admin_set_leader_listed', { p_user: userId, p_listed: !!listed, p_reason: need5(reason) });
export const setVideo = (route: string, url: unknown) => rpc('admin_set_video', { p_route: route, p_url: q(url) });
export const adminGroups = (query: unknown) => list('admin_groups', { p_query: q(query) });
export const countBadge = (label: string, n: number | null | undefined): string => ((n || 0) > 0 ? `${label} (${toBn(n as number)})` : label);

// ---------- step 026: work record search, notifications to a part ----------
export const auditSearch = (actorId: string | null, action: unknown, days?: number) => list('admin_audit_search', { p_actor: actorId || null, p_action: q(action), p_days: days || 30 });
export const auditActors = () => list('admin_audit_actors');
export const monthOk = (v: unknown): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''));
export const segmentSize = async (kind: string, value: string): Promise<number> => Number(await rpc('admin_segment_size', { p_kind: kind, p_value: value })) || 0;
export async function notifySegment(kind: string, value: string, title: unknown, body: unknown): Promise<number> {
  const t = String(title || '').trim();
  if (t.length < 2) throw fail('title');
  const r = String(await rpc('admin_notify_segment', { p_kind: kind, p_value: value, p_title: t, p_body: q(body) }));
  if (r.startsWith('ok:')) return Number(r.slice(3)) || 0;
  throw fail(r);
}
