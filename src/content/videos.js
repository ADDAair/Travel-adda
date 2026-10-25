// Video guide for every page ("▶️ ভিডিও দেখুন"). Until a video is made, the button says "শীঘ্রই আসছে".
// To add a video later: put its https link in `url` (only https links are played).
export const VIDEO_TOPICS = {
  Home: { title: 'অ্যাপ কীভাবে ব্যবহার করবেন', url: null },
  Map: { title: 'জরুরি সাহায্য ও "পথ হারিয়েছি কার্ড"', url: null },
  Dua: { title: 'দোয়া খোঁজা ও শোনা', url: null },
  Offers: { title: 'প্যাকেজ খোঁজা, বাছাই ও "আমাকে ফোন করুন"', url: null },
  Account: { title: 'আমার তথ্য, তালা ও নিরাপত্তা', url: null },
  Ihram: { title: 'মীকাত ও ইহরামের কাপড় পরা', url: null },
  Umrah: { title: 'ওমরাহ ধাপে ধাপে: তাওয়াফ, সাঈ, চুল কাটা', url: null },
  Hajj: { title: 'হজের দিনগুলো: মিনা, আরাফা, মুজদালিফা, জামারা', url: null },
  Prayer: { title: 'নামাজের সময়, অ্যালার্ম ও কিবলা', url: null },
  Privacy: { title: 'আপনার তথ্য কীভাবে নিরাপদ থাকে', url: null },
  Guides: { title: 'গাইডগুলো কীভাবে পড়বেন', url: null },
  Docs: { title: 'কাগজপত্রের ছবি তোলা ও তালা দেওয়া', url: null },
  Salah: { title: 'অজু ও নামাজের নিয়ম', url: null },
  Tasbih: { title: 'তাসবিহ গণনা', url: null },
  Calendar: { title: 'ইসলামি দিনপঞ্জি', url: null },
  Group: { title: 'দলে যোগ দেওয়া ও লিডারকে প্রশ্ন করা', url: null },
  LeaderApply: { title: 'লিডার হিসেবে আবেদন করা', url: null },
  Leader: { title: 'লিডার প্যানেল: দল ও আমন্ত্রণ', url: null },
  Admin: { title: 'অ্যাডমিন প্যানেল ব্যবহার', url: null },
  LeaderOffers: { title: 'প্যাকেজ দেওয়া ও বদলানো', url: null },
  VerifyPhone: { title: 'নম্বর ও ইমেইল যাচাই', url: null },
  MyLeader: { title: 'চুক্তি পড়া, রাজি হওয়া ও টাকা জমার রসিদ দেওয়া', url: null },
  Leaders: { title: 'যাচাই করা লিডার খোঁজা', url: null },
  LeaderContracts: { title: 'হাজীকে চুক্তি পাঠানো', url: null },
  LeaderMe: { title: 'লিডার প্রোফাইল ঠিক করা', url: null },
  Notifications: { title: 'নোটিফিকেশন দেখা', url: null },
  Terms: { title: 'শর্তাবলি', url: null },
  HelpChat: { title: 'লিডার ও খাদেমকে প্রশ্ন করা', url: null },
  ChatConsent: { title: 'বিরোধের সময় প্রশ্ন-উত্তর দেখার অনুমতি', url: null },
  HelpInbox: { title: 'হাজীদের প্রশ্নের উত্তর দেওয়া', url: null },
  GroupStaff: { title: 'খাদেম যোগ করা ও তৈরি উত্তর লেখা', url: null },
  KhademHome: { title: 'খাদেমের কাজ', url: null },
};

const safe = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u);
export function videoFor(route, topics = VIDEO_TOPICS) {
  const t = topics[route];
  const ready = !!(t && safe(t.url));
  return { title: t ? t.title : 'এই পাতা', url: ready ? t.url : null, ready, label: ready ? '▶️ ভিডিও দেখুন' : '▶️ ভিডিও দেখুন (শীঘ্রই আসছে)' };
}

// Links set by the admin (table app_videos) over the built-in list. Only known pages and https links are used.
export function mergeVideos(topics, rows) {
  const out = { ...topics };
  (rows || []).forEach((r) => { if (out[r.route] && safe(r.url)) out[r.route] = { ...out[r.route], url: r.url }; });
  return out;
}
