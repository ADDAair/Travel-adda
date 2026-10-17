// Group leader, groups, members and package terms (supabase/004_groups.sql). All rules are enforced by the database;
// this file only calls it. Every function throws on failure so screens never show a false success.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { uid, randomId, shrink } from './docs';
import { normalizePhone } from './phone';

const MAX_BYTES = 5 * 1024 * 1024;

// True when the database step (004) has not been run yet, so screens can say "coming soon" honestly.
export const notReady = (e) => {
  const code = String((e && e.code) || '');
  const m = String((e && e.message) || '').toLowerCase();
  return code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883' || m.includes('could not find the function') || m.includes('does not exist');
};
const check = (r) => { if (r.error) throw r.error; return r.data; };

export async function myProfile() {
  return check(await supabase.from('profiles').select('full_name,haji_code,phone,role,status').single());
}

// ---------- Leader application ----------
export async function myApplication() {
  const rows = check(await supabase.from('leader_applications').select('id,agency_name,license_no,status,admin_note,created_at').order('created_at', { ascending: false }).limit(1));
  return rows && rows[0] ? rows[0] : null;
}

export async function applyLeader({ agency, license, file }) {
  const me = await uid();
  let path = null;
  if (file) {
    const pdf = file.kind === 'pdf';
    const src = pdf ? file.uri : await shrink(file.uri);
    const buf = await (await fetch(src)).arrayBuffer();
    if (buf.byteLength > MAX_BYTES) { const e = new Error('too big'); e.code = 'too-big'; throw e; }
    path = `${me}/${randomId()}.${pdf ? 'pdf' : 'jpg'}`;
    const up = await supabase.storage.from('leader-docs').upload(path, buf, { contentType: pdf ? 'application/pdf' : 'image/jpeg' });
    if (up.error) throw up.error;
  }
  const ins = await supabase.from('leader_applications').insert({ agency_name: agency.trim(), license_no: license.trim(), doc_path: path }).select('id').single();
  if (ins.error) {
    if (path) await supabase.storage.from('leader-docs').remove([path]).catch(() => {});
    throw ins.error;
  }
  return ins.data;
}

// A Bangladeshi number written as 01XXXXXXXXX also works from Saudi Arabia when dialled as +8801XXXXXXXXX.
export const telBd = (p) => { const d = String(p || '').replace(/[^\d+]/g, ''); return /^01\d{9}$/.test(d) ? `+88${d}` : d; };

// ---------- Haji ----------
// The leader of the first active group is also kept on this phone, so the Emergency page can call them offline.
const LEADER_CACHE = 'ta.groupLeader.v1';
export async function myGroups() {
  const rows = check(await supabase.rpc('my_groups')) || [];
  const g = rows.find((r) => r.status === 'active');
  try {
    if (g) await AsyncStorage.setItem(LEADER_CACHE, JSON.stringify({ name: g.leader_name, phone: g.leader_phone }));
    else await AsyncStorage.removeItem(LEADER_CACHE);
  } catch (e) { /* best effort */ }
  return rows;
}
export async function cachedLeader() {
  try { const v = JSON.parse((await AsyncStorage.getItem(LEADER_CACHE)) || 'null'); return v && v.phone ? v : null; } catch (e) { return null; }
}
export const joinGroup = async (code) => check(await supabase.rpc('join_group', { p_code: String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }));
export const respondInvite = async (groupId, accept) => check(await supabase.rpc('respond_invite', { p_group: groupId, p_accept: accept }));
export const leaveGroup = async (groupId) => check(await supabase.rpc('leave_group', { p_group: groupId }));

export async function groupContracts(groupId) {
  return check(await supabase.from('contracts').select('*').eq('group_id', groupId).order('created_at', { ascending: false })) || [];
}
export async function myAcceptances() {
  const me = await uid();
  const rows = check(await supabase.from('contract_acceptances').select('contract_id,accepted_at').eq('user_id', me)) || [];
  return Object.fromEntries(rows.map((r) => [r.contract_id, r.accepted_at]));
}
export async function acceptContract(contractId) {
  check(await supabase.from('contract_acceptances').insert({ contract_id: contractId }));
}

// ---------- Announcements (leader -> whole group) ----------
// The last list is kept on the phone so announcements can be read inside the Haram without internet.
const ANN_CACHE = 'ta.announce.v1';
export async function groupAnnouncements(groupIds) {
  if (!groupIds.length) return { rows: [], offline: false };
  try {
    const rows = check(await supabase.from('group_announcements').select('id,group_id,body,created_at').in('group_id', groupIds).order('created_at', { ascending: false }).limit(60)) || [];
    AsyncStorage.setItem(ANN_CACHE, JSON.stringify(rows)).catch(() => {});
    return { rows, offline: false };
  } catch (e) {
    if (notReady(e)) throw e;
    try { const c = JSON.parse((await AsyncStorage.getItem(ANN_CACHE)) || 'null'); if (Array.isArray(c)) return { rows: c.filter((r) => groupIds.includes(r.group_id)), offline: true }; } catch (x) { /* none */ }
    throw e;
  }
}
export const postAnnouncement = async (groupId, body) => check(await supabase.from('group_announcements').insert({ group_id: groupId, body: body.trim() }));
export async function deleteAnnouncement(id) {
  const r = check(await supabase.from('group_announcements').delete().eq('id', id).select('id'));
  if (!r || !r.length) { const e = new Error('not deleted'); e.code = 'not-deleted'; throw e; }
}

// ---------- Leader ----------
export async function leaderGroups() {
  return check(await supabase.from('groups').select('id,name,season,join_code,active,created_at').order('created_at', { ascending: false })) || [];
}
export async function createGroup(name, season) {
  return check(await supabase.from('groups').insert({ name: name.trim(), season: season.trim() || null }).select('id,name,season,join_code,active,created_at').single());
}
export const inviteByPhone = async (groupId, phone) => check(await supabase.rpc('invite_by_phone', { p_group: groupId, p_phone: normalizePhone(phone) }));
export const groupMembers = async (groupId) => check(await supabase.rpc('group_members_for_leader', { p_group: groupId })) || [];
export const removeMember = async (groupId, userId) => check(await supabase.rpc('remove_member', { p_group: groupId, p_user: userId }));
export async function createContract(c) {
  return check(await supabase.from('contracts').insert(c).select('*').single());
}
export async function acceptancesFor(contractIds) {
  if (!contractIds.length) return [];
  return check(await supabase.from('contract_acceptances').select('contract_id,user_id,accepted_at').in('contract_id', contractIds)) || [];
}

// ---------- Admin ----------
export const adminApplications = async () => check(await supabase.rpc('admin_list_applications')) || [];
export const reviewApplication = async (id, approve, note) => check(await supabase.rpc('review_leader_application', { p_app: id, p_approve: approve, p_note: note || null }));
export async function leaderDocUrl(path) {
  const { data, error } = await supabase.storage.from('leader-docs').createSignedUrl(path, 300);
  if (error || !data) throw error || new Error('no url');
  return data.signedUrl;
}
