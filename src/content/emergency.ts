import { tr } from '../lib/lang';
// The haji's own emergency card (kept only on the phone). Used by EmergencyScreen and its "পথ হারিয়েছি" card.
export const EMERGENCY_FIELDS = [
  { k: 'leaderName', get label() { return tr('গ্রুপ লিডারের নাম', 'Group leader\'s name'); }, get hint() { return tr('যেমন: মাওলানা আব্দুর রহিম', 'e.g. Maulana Abdur Rahim'); } },
  { k: 'leaderPhone', get label() { return tr('গ্রুপ লিডারের মোবাইল', 'Group leader\'s mobile'); }, get hint() { return tr('যেমন: +966 5X XXX XXXX', 'e.g. +966 5X XXX XXXX'); }, phone: true },
  { k: 'hotelName', get label() { return tr('মক্কার হোটেলের নাম', 'Makkah hotel name'); }, get hint() { return tr('ইংরেজি বা আরবিতে লিখলে ভালো', 'Best written in English or Arabic'); } },
  { k: 'hotelAddr', get label() { return tr('মক্কার হোটেলের ঠিকানা / এলাকা', 'Makkah hotel address / area'); }, get hint() { return tr('যেমন: Ibrahim Khalil Road, Makkah', 'e.g. Ibrahim Khalil Road, Makkah'); } },
  { k: 'nearGate', get label() { return tr('হোটেলের কাছের হারামের গেট', 'Haram gate near the hotel'); }, get hint() { return tr('যেমন: ১ নম্বর, বাদশাহ আবদুল আজিজ গেট', 'e.g. No. 1, King Abdulaziz Gate'); } },
  { k: 'madHotel', get label() { return tr('মদিনার হোটেলের নাম', 'Madinah hotel name'); }, get hint() { return tr('ইংরেজি বা আরবিতে লিখলে ভালো', 'Best written in English or Arabic'); } },
  { k: 'madAddr', get label() { return tr('মদিনার হোটেলের ঠিকানা / এলাকা', 'Madinah hotel address / area'); }, get hint() { return tr('যেমন: King Faisal Road, Madinah', 'e.g. King Faisal Road, Madinah'); } },
  { k: 'meetPlace', get label() { return tr('দল হারালে কোথায় দেখা করবেন', 'Where to meet if separated from the group'); }, get hint() { return tr('যেমন: হারামের ৭৯ নম্বর গেটের বাইরে', 'e.g. outside Haram gate 79'); } },
  { k: 'maktab', get label() { return tr('মুয়াল্লিম / মাকতাব নম্বর', 'Muallim / Maktab number'); }, get hint() { return tr('হজ কার্ডে লেখা থাকে', 'Written on the Hajj card'); } },
  { k: 'agency', get label() { return tr('এজেন্সির নাম', 'Agency name'); }, get hint() { return tr('যে এজেন্সির মাধ্যমে যাচ্ছেন', 'The agency you travel with'); } },
];

// Rows of the lost card, in Arabic and English, for police, volunteers and taxi drivers.
export const LOST_CARD_ROWS = [
  { k: 'hotelName', ar: 'فندق مكة', en: 'Makkah hotel' },
  { k: 'hotelAddr', ar: 'العنوان', en: 'Address' },
  { k: 'nearGate', ar: 'أقرب باب للحرم', en: 'Nearest Haram gate' },
  { k: 'madHotel', ar: 'فندق المدينة', en: 'Madinah hotel' },
  { k: 'madAddr', ar: 'العنوان', en: 'Address' },
  { k: 'meetPlace', ar: 'مكان اللقاء بالمجموعة', en: 'Group meeting point' },
  { k: 'maktab', ar: 'رقم المكتب', en: 'Maktab No.' },
  { k: 'agency', ar: 'الوكالة', en: 'Agency' },
];

// Saudi numbers, checked against published pilgrim guidance (2026; Nusuk care centre: US OSAC Hajj/Umrah notice).
// 911 is the unified number in Makkah, Madinah, Riyadh and the Eastern Province; elsewhere 997 and 999 work.
export const EMERGENCY_MAIN = [
  { n: '911', get t() { return tr('জরুরি: পুলিশ, অ্যাম্বুলেন্স, আগুন', 'Emergency: police, ambulance, fire'); }, get w() { return tr('মক্কা, মদিনা, রিয়াদ ও পূর্বাঞ্চলে', 'In Makkah, Madinah, Riyadh and the Eastern Province'); } },
  { n: '997', get t() { return tr('অ্যাম্বুলেন্স (রেড ক্রিসেন্ট)', 'Ambulance (Red Crescent)'); }, get w() { return tr('সৌদি আরবের যেকোনো জায়গায়', 'Anywhere in Saudi Arabia'); } },
  { n: '1966', get t() { return tr('হাজীদের সাহায্য কেন্দ্র', 'Pilgrim help centre'); }, get w() { return tr('হজ ও ওমরাহ মন্ত্রণালয়, সৌদির ভেতর থেকে', 'Ministry of Hajj and Umrah, from inside Saudi Arabia'); } },
];
export const EMERGENCY_MORE = [
  { n: '999', get t() { return tr('পুলিশ (৯১১ না থাকা এলাকায়)', 'Police (where 911 is not available)'); } },
  { n: '998', get t() { return tr('সিভিল ডিফেন্স (আগুন)', 'Civil defence (fire)'); } },
  { n: '937', get t() { return tr('স্বাস্থ্য মন্ত্রণালয়ের পরামর্শ', 'Ministry of Health advice'); } },
  { n: '+966920002814', get t() { return tr('নুসুক হাজী সেবা কেন্দ্র (প্রতারণা বা সমস্যার অভিযোগ; দেশের বাইরে থেকেও)', 'Nusuk pilgrim care centre (complaints about fraud or problems; also from abroad)'); } },
];
export const EMERGENCY_NUMBERS = [...EMERGENCY_MAIN, ...EMERGENCY_MORE];
