// Two kinds of leader (database step 017):
//  * agency       – has an own Hajj/Umrah agency: office details, Umrah/Hajj licence and the licence picture
//  * travel_adda  – works directly with Travel Adda: no office or licence; a picture of the national ID (NID) instead
// Both may give a profession (Imam, Muazzin, Madrasa teacher ...) and must give their work area.

export const LEADER_KINDS = {
  agency: { icon: '🏢', title: 'আমার নিজের এজেন্সি আছে', what: 'হজ/ওমরাহ এজেন্সির নাম, লাইসেন্স নম্বর ও লাইসেন্সের ছবি দিতে হবে।' },
  travel_adda: { icon: '🤝', title: 'আমি Travel Adda-র সাথে সরাসরি কাজ করব', what: 'অফিস বা লাইসেন্স লাগবে না। জাতীয় পরিচয়পত্রের (NID) ছবি দিতে হবে।', badge: '✅ Travel Adda-র নিজস্ব লিডার' },
};

export const PROFESSIONS = [
  'ইমাম', 'খতিব', 'মুয়াজ্জিন', 'মাদ্রাসার শিক্ষক', 'আলেম / মুফতি', 'হাফেজ', 'স্কুল-কলেজের শিক্ষক',
  'ব্যবসায়ী', 'চাকরিজীবী', 'অবসরপ্রাপ্ত', 'শুধু হজ-ওমরাহ লিডার',
];

// "Travel Adda" in any spelling: only Travel Adda's own leaders may show it (the database blocks it too).
export const isReservedAgencyName = (name) => /travel[\s\-_.]*adda|ট্রাভেল[\s\-_.]*আড্ডা/i.test(String(name || ''));

const clean = (s) => String(s || '').trim();

// Returns { field: 'Bengali message' } for every problem; {} when the form can be sent.
export function validateApplication({ kind, agency, umrah, hajj, area = {}, file, agreed, termsExist }) {
  const e = {};
  if (!LEADER_KINDS[kind]) { e.kind = 'আপনি কোন ধরনের লিডার, সেটি বাছুন।'; return e; }
  if (kind === 'agency') {
    if (clean(agency).length < 2) e.agency = 'এজেন্সির নাম লিখুন।';
    else if (isReservedAgencyName(agency)) e.agency = 'এজেন্সির নামে "Travel Adda" ব্যবহার করা যাবে না। Travel Adda-র সাথে সরাসরি কাজ করলে ওপরে সেই ধরনটি বাছুন।';
    if (!clean(umrah) && !clean(hajj)) e.umrah = 'ওমরাহ বা হজ, অন্তত একটি লাইসেন্স নম্বর লিখুন।';
    if (!file) e.file = 'লাইসেন্সের ছবি বা PDF দিন।';
  } else if (!file) {
    e.file = 'জাতীয় পরিচয়পত্রের (NID) ছবি দিন।';
  }
  if (!area.district) e.district = 'যে জেলায় কাজ করেন, সেটি বাছুন।';
  if (!clean(area.upazila)) e.upazila = 'উপজেলা বাছুন।';
  if (clean(area.union).length < 2) e.union = 'ইউনিয়নের নাম লিখুন।';
  if (termsExist && !agreed) e.agree = 'লিডারদের শর্তাবলি পড়ে টিক দিন।';
  return e;
}

// The row for leader_applications. A Travel Adda leader sends no office/licence data at all.
export function applicationRow({ kind, agency, umrah, hajj, area = {}, profession, docPath }) {
  const common = {
    profession: clean(profession) || null,
    district: area.district || null,
    upazila: clean(area.upazila) || null,
    union_name: clean(area.union) || null,
    doc_path: docPath || null,
  };
  if (kind === 'travel_adda') {
    const { profession: p, ...rest } = common;
    return { leader_kind: 'travel_adda', profession: p, ...rest };
  }
  return {
    leader_kind: 'agency', agency_name: clean(agency), license_no: clean(umrah) || clean(hajj),
    umrah_license: clean(umrah) || null, hajj_license: clean(hajj) || null, ...common,
  };
}
