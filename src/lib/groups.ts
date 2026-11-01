// Group leader, groups, members and package terms (supabase/004_groups.sql). All rules are enforced by the database;
// this file only calls it. Every function throws on failure so screens never show a false success.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { applicationRow } from './leaderKinds';
import { uid, randomId, shrink } from './docs';
import { normalizePhone } from './phone';
import { fail, rpc } from './rpc';

import type { RpcRow } from './dbTypes';
import type { Loose, TableRow, TableInsert } from './types';
type Res = { data: unknown; error: { code?: string; message?: string } | null };
export type Profile = Loose<TableRow<'profiles'>> & { verified?: boolean | null };
export type Application = Loose<TableRow<'leader_applications'>>;
export type Announcement = Pick<TableRow<'group_announcements'>, 'id' | 'group_id' | 'body' | 'created_at'>;
export type LeaderGroup = Pick<TableRow<'groups'>, 'id' | 'name' | 'season' | 'join_code' | 'active' | 'created_at'>;

const MAX_BYTES = 5 * 1024 * 1024;

// True when the database step (004) has not been run yet, so screens can say "coming soon" honestly.
export const notReady = (e: unknown): boolean => {
  const x = (e || {}) as { code?: unknown; message?: unknown };
  const code = String(x.code || '');
  const m = String(x.message || '').toLowerCase();
  return code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883' || m.includes('could not find the function') || m.includes('does not exist');
};
const check = <T>(r: { data: T; error: { code?: string; message?: string } | null }): T => { if (r.error) throw r.error; return r.data; };

export async function myProfile(): Promise<Profile> {
  const v = await supabase.from('profiles').select('full_name,haji_code,phone,role,status,phone_verified,verified').single();
  if (!v.error) return v.data;                                                   // step 016: verified = phone OR e-mail
  const r = await supabase.from('profiles').select('full_name,haji_code,phone,role,status,phone_verified').single();
  if (!r.error) return { ...r.data, verified: r.data.phone_verified };
  if (r.error && (r.error.code === '42703' || /phone_verified/.test(r.error.message || ''))) {   // step 006 not run yet
    return check(await supabase.from('profiles').select('full_name,haji_code,phone,role,status').single());
  }
  return check(r);
}

// ---------- Leader application ----------
export async function myApplication(): Promise<Application | null> {
  let r: Res = await supabase.from('leader_applications').select('id,agency_name,license_no,umrah_license,hajj_license,district,upazila,union_name,leader_kind,profession,status,admin_note,created_at').order('created_at', { ascending: false }).limit(1);
  if (r.error && (r.error.code === '42703' || /leader_kind|profession/i.test(r.error.message || ''))) r = await supabase.from('leader_applications').select('id,agency_name,license_no,umrah_license,hajj_license,district,upazila,union_name,status,admin_note,created_at').order('created_at', { ascending: false }).limit(1);
  if (r.error && (r.error.code === '42703' || /union_name/i.test(r.error.message || ''))) {   // step 014 not run yet
    r = await supabase.from('leader_applications').select('id,agency_name,license_no,umrah_license,hajj_license,district,upazila,status,admin_note,created_at').order('created_at', { ascending: false }).limit(1);
  }
  if (r.error && (r.error.code === '42703' || /column/i.test(r.error.message || ''))) {
    r = await supabase.from('leader_applications').select('id,agency_name,license_no,status,admin_note,created_at').order('created_at', { ascending: false }).limit(1);
  }
  const rows = check(r) as Application[] | null;
  return rows && rows[0] ? rows[0] : null;
}

// kind 'agency' | 'travel_adda' (step 017); the row itself is built by applicationRow() in leaderKinds.js.
export type LeaderFile = { uri: string; kind: 'image' | 'pdf' };
export async function applyLeader({ kind = 'agency', agency, umrah, hajj, area = {}, profession, file }:
  { kind?: string; agency?: string; umrah?: string; hajj?: string; area?: Record<string, unknown>; profession?: string | null; file?: LeaderFile | null }): Promise<{ id: string }> {
  const me = await uid();
  let path: string | null = null;
  if (file) {
    const pdf = file.kind === 'pdf';
    const src: string = pdf ? file.uri : await shrink(file.uri);
    const buf = await (await fetch(src)).arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw fail('too-big');
    path = `${me}/${randomId()}.${pdf ? 'pdf' : 'jpg'}`;
    const up = await supabase.storage.from('leader-docs').upload(path, buf, { contentType: pdf ? 'application/pdf' : 'image/jpeg' });
    if (up.error) throw up.error;
  }
  const row = applicationRow({ kind, agency, umrah, hajj, area, profession, docPath: path });
  let ins: Res = await supabase.from('leader_applications').insert(row as TableInsert<'leader_applications'>).select('id').single();
  const missing = ins.error && (ins.error.code === 'PGRST204' || ins.error.code === '42703') && /leader_kind|profession/i.test(ins.error.message || '');
  if (missing && kind === 'travel_adda') {          // step 017 not run yet: a Travel Adda leader cannot be recorded correctly
    if (path) await supabase.storage.from('leader-docs').remove([path]).catch(() => {});
    throw fail('kinds-soon');
  }
  if (missing) {                                     // step 017 not run yet: an agency application still works without the new fields
    const { leader_kind: _k, profession: _p, ...old } = row;
    ins = await supabase.from('leader_applications').insert(old as TableInsert<'leader_applications'>).select('id').single();
  }
  if (ins.error) {
    if (path) await supabase.storage.from('leader-docs').remove([path]).catch(() => {});
    throw ins.error;
  }
  return ins.data as { id: string };
}

// Is step 017 (leader kinds + profession) live? Lets the form say "coming soon" instead of failing.
export async function leaderKindsReady(): Promise<boolean> {
  const r = await supabase.from('leader_applications').select('leader_kind').limit(1);
  return !(r.error && (r.error.code === '42703' || /leader_kind/i.test(r.error.message || '')));
}

// A Bangladeshi number written as 01XXXXXXXXX also works from Saudi Arabia when dialled as +8801XXXXXXXXX.
// A group made by mistake (030): the server deletes it if nothing ever happened in it, otherwise closes it.
export type RemoveResult = 'deleted' | 'closed' | 'already_closed' | 'not_found';
export async function removeGroup(groupId: string): Promise<RemoveResult> {
  try { return (await rpc<RemoveResult>('leader_remove_group', { p_group: groupId })) as RemoveResult; }
  catch (e) { if (notReady(e)) throw fail('soon'); throw e; }
}
export async function reopenGroup(groupId: string): Promise<void> {
  try { await rpc<string>('leader_reopen_group', { p_group: groupId }); }
  catch (e) { if (notReady(e)) throw fail('soon'); throw e; }
}
const REMOVED: Record<string, string> = {
  deleted: 'দলটি মুছে ফেলা হয়েছে।',
  closed: 'দলে কেউ যোগ দিয়েছিলেন বা আমন্ত্রণ পেয়েছিলেন, তাই রেকর্ড রাখতে দলটি মোছা হয়নি, বন্ধ করা হয়েছে। নতুন কেউ আর যোগ দিতে পারবেন না। চাইলে পরে আবার চালু করতে পারবেন।',
  already_closed: 'দলটি আগেই বন্ধ করা আছে।',
  not_found: 'দলটি আর পাওয়া যায়নি।',
};
export const removeGroupText = (r: string): string => REMOVED[r] || 'কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।';

export const telBd = (p: unknown): string => { const d = String(p || '').replace(/[^\d+]/g, ''); return /^01\d{9}$/.test(d) ? `+88${d}` : d; };

// ---------- Haji ----------
// The leader of the first active group is also kept on this phone, so the Emergency page can call them offline.
const LEADER_CACHE = 'ta.groupLeader.v1';
export async function myGroups(): Promise<RpcRow<'my_groups'>[]> {
  const rows = check(await supabase.rpc('my_groups')) || [];
  const g = rows.find((r) => r.status === 'active');
  try {
    if (g) await AsyncStorage.setItem(LEADER_CACHE, JSON.stringify({ name: g.leader_name, phone: g.leader_phone }));
    else await AsyncStorage.removeItem(LEADER_CACHE);
  } catch (e) { /* best effort */ }
  return rows;
}
export async function cachedLeader(): Promise<{ name: string; phone: string } | null> {
  try { const v = JSON.parse((await AsyncStorage.getItem(LEADER_CACHE)) || 'null') as { name: string; phone: string } | null; return v && v.phone ? v : null; } catch (e) { return null; }
}
export const joinGroup = async (code: unknown) => check(await supabase.rpc('join_group', { p_code: String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }));
export const respondInvite = async (groupId: string, accept: boolean) => check(await supabase.rpc('respond_invite', { p_group: groupId, p_accept: accept }));
export const leaveGroup = async (groupId: string) => check(await supabase.rpc('leave_group', { p_group: groupId }));

export async function groupContracts(groupId: string): Promise<TableRow<'contracts'>[]> {
  return check(await supabase.from('contracts').select('*').eq('group_id', groupId).order('created_at', { ascending: false })) || [];
}
export async function myAcceptances(): Promise<Record<string, string>> {
  const me = await uid();
  const rows = check(await supabase.from('contract_acceptances').select('contract_id,accepted_at').eq('user_id', me)) || [];
  return Object.fromEntries(rows.map((r) => [r.contract_id, r.accepted_at]));
}
export async function acceptContract(contractId: string): Promise<void> {
  check(await supabase.from('contract_acceptances').insert({ contract_id: contractId }));
}

// ---------- Announcements (leader -> whole group) ----------
// The last list is kept on the phone so announcements can be read inside the Haram without internet.
const ANN_CACHE = 'ta.announce.v1';
export async function groupAnnouncements(groupIds: string[]): Promise<{ rows: Announcement[]; offline: boolean }> {
  if (!groupIds.length) return { rows: [], offline: false };
  try {
    const rows = check(await supabase.from('group_announcements').select('id,group_id,body,created_at').in('group_id', groupIds).order('created_at', { ascending: false }).limit(60)) || [];
    AsyncStorage.setItem(ANN_CACHE, JSON.stringify(rows)).catch(() => {});
    return { rows, offline: false };
  } catch (e) {
    if (notReady(e)) throw e;
    try { const c: unknown = JSON.parse((await AsyncStorage.getItem(ANN_CACHE)) || 'null'); if (Array.isArray(c)) return { rows: (c as Announcement[]).filter((r) => groupIds.includes(r.group_id)), offline: true }; } catch (x) { /* none */ }
    throw e;
  }
}
export const postAnnouncement = async (groupId: string, body: string) => check(await supabase.from('group_announcements').insert({ group_id: groupId, body: body.trim() }));
export async function deleteAnnouncement(id: string): Promise<void> {
  const r = check(await supabase.from('group_announcements').delete().eq('id', id).select('id'));
  if (!r || !r.length) throw fail('not-deleted');
}

// ---------- Leader ----------
export async function leaderGroups(): Promise<LeaderGroup[]> {
  return check(await supabase.from('groups').select('id,name,season,join_code,active,created_at').order('created_at', { ascending: false })) || [];
}
export async function createGroup(name: string, season: string): Promise<LeaderGroup> {
  return check(await supabase.from('groups').insert({ name: name.trim(), season: season.trim() || null }).select('id,name,season,join_code,active,created_at').single());
}
export const inviteByPhone = async (groupId: string, phone: string) => check(await supabase.rpc('invite_by_phone', { p_group: groupId, p_phone: normalizePhone(phone) }));
export const groupMembers = async (groupId: string): Promise<RpcRow<'group_members_for_leader'>[]> => check(await supabase.rpc('group_members_for_leader', { p_group: groupId })) || [];
export const removeMember = async (groupId: string, userId: string) => check(await supabase.rpc('remove_member', { p_group: groupId, p_user: userId }));
export async function createContract(c: TableInsert<'contracts'>): Promise<TableRow<'contracts'>> {
  return check(await supabase.from('contracts').insert(c).select('*').single());
}
export async function acceptancesFor(contractIds: string[]): Promise<Pick<TableRow<'contract_acceptances'>, 'contract_id' | 'user_id' | 'accepted_at'>[]> {
  if (!contractIds.length) return [];
  return check(await supabase.from('contract_acceptances').select('contract_id,user_id,accepted_at').in('contract_id', contractIds)) || [];
}

// ---------- Admin ----------
export const adminApplications = async (): Promise<RpcRow<'admin_list_applications'>[]> => check(await supabase.rpc('admin_list_applications')) || [];
export const reviewApplication = async (id: string, approve: boolean, note?: string | null) => check(await supabase.rpc('review_leader_application', { p_app: id, p_approve: approve, p_note: note || null }));
export async function leaderDocUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('leader-docs').createSignedUrl(path, 300);
  if (error || !data) throw error || new Error('no url');
  return data.signedUrl;
}
