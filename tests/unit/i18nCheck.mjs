// Shared by the English tests: finds Bengali text that has no English beside it.
// remove every tr(...) call (its arguments may hold quotes, backticks and ${...}) so only unpaired text is left
export function stripTr(src) {
  let out = ''; let i = 0;
  while (i < src.length) {
    const at = src.indexOf('tr(', i);
    if (at < 0 || /[\w.$]/.test(src[at - 1] || '')) { if (at < 0) { out += src.slice(i); break; } out += src.slice(i, at + 3); i = at + 3; continue; }
    out += src.slice(i, at) + 'tr(…)';
    let j = at + 3; const stack = [')'];
    while (j < src.length && stack.length) {
      const c = src[j]; const top = stack[stack.length - 1];
      if (top === "'" || top === '"') { if (c === '\\') j++; else if (c === top) stack.pop(); }
      else if (top === '`') { if (c === '\\') j++; else if (c === '`') stack.pop(); else if (c === '$' && src[j + 1] === '{') { stack.push('}'); j++; } }
      else if (c === "'" || c === '"' || c === '`') stack.push(c);
      else if (c === '(') stack.push(')'); else if (c === '{') stack.push('}'); else if (c === '[') stack.push(']');
      else if (c === top) stack.pop();
      j++;
    }
    i = j;
  }
  return out;
}
