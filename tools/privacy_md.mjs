// Regenerates docs/privacy-policy-bn.md from src/content/privacy.js:  node tools/privacy_md.mjs
import fs from 'node:fs';
const src = fs.readFileSync('src/content/privacy.js', 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
let md = `# Travel Adda – Haj & Umrah Assistant: গোপনীয়তা নীতি\n\nসর্বশেষ হালনাগাদ: ${mod.PRIVACY_UPDATED}\n\n> এই ফাইল অ্যাপের ভেতরের গোপনীয়তা নীতির (src/content/privacy.js) হুবহু কপি। Play Store-এর জন্য এটি কোনো পাবলিক ওয়েব পাতায় রাখতে হবে।\n`;
for (const s of mod.PRIVACY) {
  md += `\n## ${s.title}\n\n`;
  if (s.text) md += `${s.text}\n`;
  if (s.items) md += s.items.map((i) => `- ${i}`).join('\n') + '\n';
}
md += `\n## যোগাযোগ\n\n${mod.PRIVACY_CONTACT ? mod.PRIVACY_CONTACT : '(অ্যাপ প্রকাশের আগে সাপোর্ট ইমেইল এখানে যুক্ত হবে।)'}\n`;
fs.writeFileSync('docs/privacy-policy-bn.md', md);
