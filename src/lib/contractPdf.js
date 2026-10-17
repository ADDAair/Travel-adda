// The signed contract as a PDF for both sides (made on the phone, then shared/saved with the phone's own menu).
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { toBn } from './phone';

const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const day = (iso) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${toBn(d.getDate())} ${MONTHS[d.getMonth()]} ${toBn(d.getFullYear())}`; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])).replace(/\n/g, '<br>');
const STATUS = { sent: 'হাজীর উত্তরের অপেক্ষায়', accepted: 'দুপক্ষের সম্মতিতে চালু', declined: 'হাজী রাজি হননি', withdrawn: 'লিডার ফিরিয়ে নিয়েছেন', cancelled: 'বাতিল', completed: 'সম্পন্ন' };

export function contractHtml(c) {
  const row = (l, v) => (v ? `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>` : '');
  const price = `${toBn(Number(c.price_bdt).toLocaleString('en-IN', { maximumFractionDigits: 2 }))} টাকা`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:'Noto Sans Bengali','Hind Siliguri',sans-serif;color:#111;padding:24px;font-size:14px;line-height:1.6}
    h1{color:#001952;font-size:22px;margin:0} .sub{color:#555;margin:4px 0 16px} table{width:100%;border-collapse:collapse;margin:12px 0}
    th{width:32%;text-align:left;vertical-align:top;background:#F3F5FA;padding:8px;border:1px solid #D6DCE8} td{padding:8px;border:1px solid #D6DCE8}
    .st{display:inline-block;padding:4px 10px;border:2px solid #001952;border-radius:8px;font-weight:bold} .foot{margin-top:24px;color:#555;font-size:12px}
  </style></head><body>
  <h1>Travel Adda – হজ/ওমরাহ চুক্তি</h1>
  <div class="sub">চুক্তি নম্বর: <b>${esc(c.contract_no)}</b> · অবস্থা: <span class="st">${esc(STATUS[c.status] || c.status)}</span></div>
  <table>
    ${row('লিডার', `${c.leader_name || ''} (${c.leader_code || ''})`)}${row('এজেন্সি', c.agency_name)}
    ${row('হাজী', `${c.haji_name || ''} (${c.haji_code || ''})`)}
    ${row('ধরন', c.kind === 'hajj' ? 'হজ' : 'ওমরাহ')}${row('প্যাকেজ', c.title)}${row('জনপ্রতি মোট দাম', price)}
    ${row('যাত্রা', c.travel_from ? `${day(c.travel_from)}${c.travel_to ? ` থেকে ${day(c.travel_to)}` : ''}` : '')}
    ${row('যা অন্তর্ভুক্ত', c.includes)}${row('যা অন্তর্ভুক্ত নয়', c.excludes)}${row('বাতিল ও টাকা ফেরতের নিয়ম', c.refund_policy)}${row('অন্যান্য শর্ত', c.extra_terms)}
    ${row('লিডার পাঠিয়েছেন', day(c.created_at))}${row(c.status === 'declined' ? 'হাজী না বলেছেন' : 'হাজী সম্মতি দিয়েছেন', c.responded_at ? day(c.responded_at) : '')}
    ${row('বাতিল', c.cancelled_at ? `${day(c.cancelled_at)} – কারণ: ${c.cancel_reason || ''}` : '')}${row('সম্পন্ন', c.completed_at ? day(c.completed_at) : '')}
  </table>
  <div class="foot">এই চুক্তি Travel Adda অ্যাপে দুপক্ষ নিজ নিজ অ্যাকাউন্ট থেকে পাঠিয়েছেন ও সম্মতি দিয়েছেন। হাজী টাকা দেবেন শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে; Travel Adda যাচাই করে কমিশন রেখে বাকি টাকা লিডারকে দেয়। তৈরি: ${day(new Date().toISOString())}</div>
  </body></html>`;
}

// Returns 'shared' | 'printed' | throws.
export async function shareContractPdf(c) {
  const html = contractHtml(c);
  if (Platform.OS === 'web') { await Print.printAsync({ html }); return 'printed'; }
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `চুক্তি ${c.contract_no}`, UTI: 'com.adobe.pdf' });
    return 'shared';
  }
  await Print.printAsync({ uri });
  return 'printed';
}
