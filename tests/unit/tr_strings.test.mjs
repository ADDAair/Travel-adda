// Found Nov 2026: while adding English, a tr(...) call once ended up *inside* a text, so the Bengali page showed
// 'tr("আমাকে ফোন করুন", "Call me")' to the haji, and an escaped backtick broke a page. This test reads every source file
// with the TypeScript parser: no syntax errors, and no text that contains "tr(" (it must be code, not words).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let ts = null;
try { ts = (await import('typescript')).default; } catch (e) { ts = null; }
const ROOT = new URL('../../', import.meta.url).pathname;
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p); } };
walk(join(ROOT, 'src')); files.push(join(ROOT, 'App.tsx'));

test('every source file parses, and no text contains a tr( call', { skip: ts ? false : 'typescript is not installed here (CI has it)' }, () => {
  const bad = [];
  for (const f of files) {
    const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    for (const d of sf.parseDiagnostics) bad.push(`${f.slice(ROOT.length)}:${sf.getLineAndCharacterOfPosition(d.start).line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    const look = (n) => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) && /\btr\(/.test(n.text)) {
        bad.push(`${f.slice(ROOT.length)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: text holds tr(: ${n.text.slice(0, 80)}`);
      }
      ts.forEachChild(n, look);
    };
    look(sf);
  }
  assert.deepEqual(bad, []);
});
