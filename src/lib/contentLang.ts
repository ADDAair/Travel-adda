// English for the bundled guides, duas and prayer content (English step 3, owner request Nov 2026).
// The Bengali content files stay exactly as they are (checked by an alim). The English lives in src/content/en/*.ts as
// "path → text", where a path is the export name, then each key, with list items named by their id when they have one
// (e.g. "DUAS.sana.parts.0.bn"). Arabic and settings (ids, icons, routes...) are never translated.
// When English is chosen, inLang() gives a copy of the content with every text it has an English for.
import { getLang } from './lang';

export type EnMap = Readonly<Record<string, string>>;
export const SKIP_KEYS: ReadonlySet<string> = new Set(['id', 'icon', 'type', 'kind', 'cat', 'to', 'route', 'screen', 'url', 'link', 'ar',
  'key', 'color', 'src', 'img', 'images', 'duas', 'ids']);
const BENGALI = /[ঀ-৲৴-৿]/;

type Obj = Record<string, unknown>;
const seg = (x: unknown, i: number): string => (x && typeof x === 'object' && typeof (x as Obj).id === 'string' ? String((x as Obj).id) : String(i));

// Every Bengali text in a piece of content, with its path (used by the tests and to write the English files).
export function bengaliTexts(v: unknown, root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (x: unknown, p: string): void => {
    if (typeof x === 'string') { if (BENGALI.test(x)) out[p] = x; return; }
    if (Array.isArray(x)) { x.forEach((y, i) => walk(y, `${p}.${seg(y, i)}`)); return; }
    if (x && typeof x === 'object') for (const k of Object.keys(x)) { if (!SKIP_KEYS.has(k)) walk((x as Obj)[k], `${p}.${k}`); }
  };
  walk(v, root);
  return out;
}

// The content with English texts put in (a new copy; the Bengali original is never changed).
export function translate<T>(v: T, root: string, en: EnMap): T {
  const walk = (x: unknown, p: string): unknown => {
    if (typeof x === 'string') return BENGALI.test(x) && typeof en[p] === 'string' ? en[p] : x;
    if (Array.isArray(x)) return x.map((y, i) => walk(y, `${p}.${seg(y, i)}`));
    if (x && typeof x === 'object') {
      const o: Obj = {};
      for (const k of Object.keys(x)) o[k] = SKIP_KEYS.has(k) ? (x as Obj)[k] : walk((x as Obj)[k], `${p}.${k}`);
      return o;
    }
    return x;
  };
  return walk(v, root) as T;
}

// In Bengali: the content itself. In English: a translated copy, made once and then kept.
let cache = new WeakMap<EnMap, Map<string, { from: unknown; to: unknown }>>();   // per English file, per export
export function inLang<T>(v: T, root: string, en: EnMap): T {
  if (getLang() !== 'en') return v;
  let m = cache.get(en);
  if (!m) { m = new Map(); cache.set(en, m); }
  const c = m.get(root);
  if (c && c.from === v) return c.to as T;
  const to = translate(v, root, en);
  m.set(root, { from: v, to });
  return to;
}
// Admin corrections change the Bengali in place: forget the copies so English is made again from the new state.
export const clearLangCache = (): void => { cache = new WeakMap(); };
