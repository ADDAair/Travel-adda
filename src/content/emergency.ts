// The haji's own emergency card (kept only on the phone). Used by EmergencyScreen and its "পথ হারিয়েছি" card.
export const EMERGENCY_FIELDS = [
  { k: 'leaderName', label: 'গ্রুপ লিডারের নাম', hint: 'যেমন: মাওলানা আব্দুর রহিম' },
  { k: 'leaderPhone', label: 'গ্রুপ লিডারের মোবাইল', hint: 'যেমন: +966 5X XXX XXXX', phone: true },
  { k: 'hotelName', label: 'মক্কার হোটেলের নাম', hint: 'ইংরেজি বা আরবিতে লিখলে ভালো' },
  { k: 'hotelAddr', label: 'মক্কার হোটেলের ঠিকানা / এলাকা', hint: 'যেমন: Ibrahim Khalil Road, Makkah' },
  { k: 'nearGate', label: 'হোটেলের কাছের হারামের গেট', hint: 'যেমন: ১ নম্বর, বাদশাহ আবদুল আজিজ গেট' },
  { k: 'madHotel', label: 'মদিনার হোটেলের নাম', hint: 'ইংরেজি বা আরবিতে লিখলে ভালো' },
  { k: 'madAddr', label: 'মদিনার হোটেলের ঠিকানা / এলাকা', hint: 'যেমন: King Faisal Road, Madinah' },
  { k: 'meetPlace', label: 'দল হারালে কোথায় দেখা করবেন', hint: 'যেমন: হারামের ৭৯ নম্বর গেটের বাইরে' },
  { k: 'maktab', label: 'মুয়াল্লিম / মাকতাব নম্বর', hint: 'হজ কার্ডে লেখা থাকে' },
  { k: 'agency', label: 'এজেন্সির নাম', hint: 'যে এজেন্সির মাধ্যমে যাচ্ছেন' },
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
  { n: '911', t: 'জরুরি: পুলিশ, অ্যাম্বুলেন্স, আগুন', w: 'মক্কা, মদিনা, রিয়াদ ও পূর্বাঞ্চলে' },
  { n: '997', t: 'অ্যাম্বুলেন্স (রেড ক্রিসেন্ট)', w: 'সৌদি আরবের যেকোনো জায়গায়' },
  { n: '1966', t: 'হাজীদের সাহায্য কেন্দ্র', w: 'হজ ও ওমরাহ মন্ত্রণালয়, সৌদির ভেতর থেকে' },
];
export const EMERGENCY_MORE = [
  { n: '999', t: 'পুলিশ (৯১১ না থাকা এলাকায়)' },
  { n: '998', t: 'সিভিল ডিফেন্স (আগুন)' },
  { n: '937', t: 'স্বাস্থ্য মন্ত্রণালয়ের পরামর্শ' },
  { n: '+966920002814', t: 'নুসুক হাজী সেবা কেন্দ্র (প্রতারণা বা সমস্যার অভিযোগ; দেশের বাইরে থেকেও)' },
];
export const EMERGENCY_NUMBERS = [...EMERGENCY_MAIN, ...EMERGENCY_MORE];
