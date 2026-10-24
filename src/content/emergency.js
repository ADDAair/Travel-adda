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
