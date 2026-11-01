// Strict types everywhere (owner request Nov 2026): "কাগজপত্র ইত্যাদি পাতায় এখনো ঢিলেঢালা ধরন আছে ... ঠিক কর".
// Written first (TDD): fails while any file still uses the loose type `any` (or the loose `Row` = Record<string, any>).
// Only the generated database file may mention `any`-free JSON types; it is checked separately (types_check.sh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = new URL(f, dir);
    if (statSync(p).isDirectory()) walk(new URL(`${f}/`, dir));
    else if (/\.tsx?$/.test(f) && !f.endsWith('dbTypes.ts')) files.push(p);
  }
};
walk(new URL('src/', root));
files.push(new URL('App.tsx', root));

// Remove comments and string/template literals so words like "any" in text don't count.
const code = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
  .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
  .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
  .replace(/`(?:\\.|[^`\\])*`/g, '``');
const LOOSE = [/\bany\b/g];

export function looseSites() {
  const out = [];
  for (const u of files) {
    const lines = code(readFileSync(u, 'utf8')).split('\n');
    lines.forEach((l, i) => { if (LOOSE.some((re) => { re.lastIndex = 0; return re.test(l); })) out.push(`${u.pathname.split('/travel-adda/').pop() || u.pathname}:${i + 1}: ${l.trim().slice(0, 120)}`); });
  }
  return out;
}

test('no loose `any` types left anywhere in the app (screens, components, logic, content)', () => {
  const left = looseSites();
  assert.deepEqual(left, [], `${left.length} loose type(s) left:\n${left.join('\n')}`);
});

// Screens that still import it fail the type check, so this also covers every user of Row.
test('navTypes no longer offers the loose Row type', () => {
  const s = code(readFileSync(new URL('src/screens/navTypes.ts', root), 'utf8'));
  assert.ok(!/\bRow\b/.test(s), 'Row = Record<string, any> must be gone');
});
