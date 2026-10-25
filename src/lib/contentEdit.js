// Guide & dua text corrections set by the admin (table content_overrides, supabase/024_admin_part3.sql).
// Only existing text can change: a correction whose place does not exist, or is not text, is ignored, so a
// mistake on the server can never break a page. The app's own text is kept and comes back when a correction
// is removed. Corrections are cached on the phone for offline use.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toBn } from './phone';

const SKIP = new Set(['id', 'icon', 'type', 'kind', 'cat', 'to', 'route', 'screen', 'url', 'link']);
const KEY = { title: 'শিরোনাম', what: 'ছোট বিবরণ', text: 'লেখা', tip: 'টিপস', bn: 'বাংলা অর্থ', ar: 'আরবি', pron: 'উচ্চারণ',
  when: 'কখন পড়বেন', source: 'সূত্র', note: 'নোট', label: 'নাম', a11y: 'পড়ে শোনানোর লেখা' };
const LIST = { blocks: 'অংশ', steps: 'ধাপ', parts: 'ভাগ', items: 'লাইন', rows: 'সারি' };
const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

function label(path) {
  const seg = path.split('.'); const out = [];
  for (let i = 0; i < seg.length; i += 1) {
    const s = seg[i]; const n = seg[i + 1];
    if (LIST[s] && /^\d+$/.test(n || '')) { out.push(`${LIST[s]} ${toBn(Number(n) + 1)}`); i += 1; }
    else if (/^\d+$/.test(s)) out.push(toBn(Number(s) + 1));
    else out.push(KEY[s] || s);
  }
  return out.join(' › ');
}

// Every editable text of one guide or dua, in reading order.
export function textFields(item) {
  const out = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { if (path) out.push({ path, label: label(path), value: v }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path ? `${path}.${i}` : String(i))); return; }
    if (v && typeof v === 'object') Object.keys(v).forEach((k) => { if (!SKIP.has(k)) walk(v[k], path ? `${path}.${k}` : k); });
  };
  walk(item, '');
  return out;
}

const ORIG = new Map();   // "kind/item/path" -> the app's own text

function locate(item, path) {
  const seg = String(path || '').split('.');
  if (!seg.length || seg.some((s) => !/^[A-Za-z0-9_]+$/.test(s) || SKIP.has(s))) return null;
  let o = item;
  for (let i = 0; i < seg.length - 1; i += 1) { if (!own(o, seg[i])) return null; o = o[seg[i]]; }
  const last = seg[seg.length - 1];
  if (!own(o, last) || typeof o[last] !== 'string') return null;
  return { o, last };
}

// Puts the corrections of one kind ('guide' | 'dua') into the list, after first restoring the app's own text.
export function applyOverrides(list, rows, kind) {
  for (const [k, v] of [...ORIG]) {
    if (!k.startsWith(`${kind}/`)) continue;
    const [, id, ...p] = k.split('/');
    const item = (list || []).find((x) => x.id === id);
    const at = item && locate(item, p.join('/'));
    if (at) at.o[at.last] = v;
    ORIG.delete(k);
  }
  (rows || []).filter((r) => r && r.kind === kind && typeof r.body === 'string' && r.body.trim()).forEach((r) => {
    const item = (list || []).find((x) => x.id === r.item_id);
    const at = item && locate(item, r.path);
    if (!at) return;
    const k = `${kind}/${r.item_id}/${r.path}`;
    if (!ORIG.has(k)) ORIG.set(k, at.o[at.last]);
    at.o[at.last] = r.body;
  });
}

const CACHE = 'ta.content.v1';
// Called once at app start: cached corrections first (offline), then fresh ones from the server.
export async function loadContentOverrides(lists) {
  const put = (rows) => Object.entries(lists).forEach(([kind, list]) => applyOverrides(list, rows, kind));
  try { const c = JSON.parse((await AsyncStorage.getItem(CACHE)) || 'null'); if (Array.isArray(c)) put(c); } catch (e) { /* no cache */ }
  try {
    const r = await supabase.from('content_overrides').select('kind,item_id,path,body');
    if (r.error) return;                    // offline, or step 024 not run yet
    put(r.data || []);
    AsyncStorage.setItem(CACHE, JSON.stringify(r.data || [])).catch(() => {});
  } catch (e) { /* keep */ }
}

export async function listOverrides() {
  const r = await supabase.from('content_overrides').select('kind,item_id,path,body,updated_at');
  if (r.error) throw r.error;
  return r.data || [];
}

export async function setContent(kind, item, path, body) {
  const b = body == null ? null : String(body).trim();
  if (b !== null && !b) throw Object.assign(new Error('empty'), { code: 'empty' });
  const r = await supabase.rpc('admin_set_content', { p_kind: kind, p_item: item, p_path: path, p_body: b });
  if (r.error) throw r.error;
  return r.data;
}

// The app's own text for a place (for "আগের লেখা" in the editor).
export const originalText = (kind, item, path) => ORIG.get(`${kind}/${item}/${path}`);
