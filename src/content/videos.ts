// Video guide for every page ("▶️ ভিডিও দেখুন"). Until a video is made, the button says "শীঘ্রই আসছে".
// To add a video later: put its https link in `url` (only https links are played).
import { tr } from '../lib/lang';

export type VideoTopic = { title: string; en?: string; url: string | null };
export const VIDEO_TOPICS: Record<string, VideoTopic> = {
  Home: { title: 'অ্যাপ কীভাবে ব্যবহার করবেন', en: 'How to use the app', url: null },
  Map: { title: 'জরুরি সাহায্য ও "পথ হারিয়েছি কার্ড"', en: 'Emergency help and the "I am lost" card', url: null },
  Dua: { title: 'দোয়া খোঁজা ও শোনা', en: 'Finding and listening to duas', url: null },
  Offers: { title: 'প্যাকেজ খোঁজা, বাছাই ও "আমাকে ফোন করুন"', en: 'Finding and choosing packages, and "Call me"', url: null },
  Account: { title: 'আমার তথ্য, তালা ও নিরাপত্তা', en: 'My info, lock and safety', url: null },
  Ihram: { title: 'মীকাত ও ইহরামের কাপড় পরা', en: 'Miqat and putting on the ihram', url: null },
  Umrah: { title: 'ওমরাহ ধাপে ধাপে: তাওয়াফ, সাঈ, চুল কাটা', en: 'Umrah step by step: tawaf, sa\'i, cutting hair', url: null },
  Hajj: { title: 'হজের দিনগুলো: মিনা, আরাফা, মুজদালিফা, জামারা', en: 'The days of Hajj: Mina, Arafah, Muzdalifah, Jamarat', url: null },
  Prayer: { title: 'নামাজের সময়, অ্যালার্ম ও কিবলা', en: 'Prayer times, alarms and Qibla', url: null },
  Privacy: { title: 'আপনার তথ্য কীভাবে নিরাপদ থাকে', en: 'How your information stays safe', url: null },
  Guides: { title: 'গাইডগুলো কীভাবে পড়বেন', en: 'How to read the guides', url: null },
  Docs: { title: 'কাগজপত্রের ছবি তোলা ও তালা দেওয়া', en: 'Taking photos of documents and locking them', url: null },
  Trip: { title: 'আমার সফরের হিসাব দেখা ও যাত্রার তারিখ লেখা', en: 'Seeing my trip and writing the travel dates', url: null },
  Salah: { title: 'অজু ও নামাজের নিয়ম', en: 'Rules of wudu and prayer', url: null },
  Tasbih: { title: 'তাসবিহ গণনা', en: 'Tasbih counter', url: null },
  Calendar: { title: 'ইসলামি দিনপঞ্জি', en: 'Islamic calendar', url: null },
  Group: { title: 'দলে যোগ দেওয়া ও লিডারকে প্রশ্ন করা', en: 'Joining a group and asking the leader', url: null },
  LeaderApply: { title: 'লিডার হিসেবে আবেদন করা', en: 'Applying as a leader', url: null },
  Leader: { title: 'লিডার প্যানেল: দল ও আমন্ত্রণ', en: 'Leader panel: groups and invitations', url: null },
  Admin: { title: 'অ্যাডমিন প্যানেল ব্যবহার', en: 'Using the admin panel', url: null },
  LeaderOffers: { title: 'প্যাকেজ দেওয়া ও বদলানো', en: 'Adding and changing packages', url: null },
  VerifyPhone: { title: 'নম্বর ও ইমেইল যাচাই', en: 'Checking number and email', url: null },
  MyLeader: { title: 'চুক্তি পড়া, রাজি হওয়া ও টাকা জমার রসিদ দেওয়া', en: 'Reading and accepting the contract, and sending payment receipts', url: null },
  Leaders: { title: 'যাচাই করা লিডার খোঁজা', en: 'Finding verified leaders', url: null },
  LeaderContracts: { title: 'হাজীকে চুক্তি পাঠানো', en: 'Sending a contract to a haji', url: null },
  LeaderMe: { title: 'লিডার প্রোফাইল ঠিক করা', en: 'Setting up the leader profile', url: null },
  Notifications: { title: 'নোটিফিকেশন দেখা', en: 'Seeing notifications', url: null },
  Terms: { title: 'শর্তাবলি', en: 'Terms', url: null },
  HelpChat: { title: 'লিডার ও খাদেমকে প্রশ্ন করা', en: 'Asking the leader and khadems', url: null },
  Fund: { title: 'সহায়তা তহবিলে দান ও আবেদন', en: 'Giving to and applying for the help fund', url: null },
  ChatConsent: { title: 'বিরোধের সময় প্রশ্ন-উত্তর দেখার অনুমতি', en: 'Permission to see questions and answers in a dispute', url: null },
  HelpInbox: { title: 'হাজীদের প্রশ্নের উত্তর দেওয়া', en: 'Answering hajis\' questions', url: null },
  GroupStaff: { title: 'খাদেম যোগ করা ও তৈরি উত্তর লেখা', en: 'Adding khadems and writing ready answers', url: null },
  KhademHome: { title: 'খাদেমের কাজ', en: 'The khadem\'s work', url: null },
};

const safe = (u: unknown): u is string => typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u);
export function videoFor(route: string, topics: Record<string, VideoTopic> = VIDEO_TOPICS): { title: string; url: string | null; ready: boolean; label: string } {
  const t = topics[route];
  const ready = !!(t && safe(t.url));
  return { title: t ? tr(t.title, t.en || t.title) : tr('এই পাতা', 'this page'), url: ready && t ? t.url : null, ready,
    label: ready ? tr('▶️ ভিডিও দেখুন', '▶️ Watch video') : tr('▶️ ভিডিও দেখুন (শীঘ্রই আসছে)', '▶️ Watch video (coming soon)') };
}

// Links set by the admin (table app_videos) over the built-in list. Only known pages and https links are used.
export function mergeVideos(topics: Record<string, VideoTopic>, rows: { route: string; url: string }[] | null | undefined): Record<string, VideoTopic> {
  const out: Record<string, VideoTopic> = { ...topics };
  (rows || []).forEach((r) => { if (out[r.route] && safe(r.url)) out[r.route] = { ...out[r.route], url: r.url }; });
  return out;
}
