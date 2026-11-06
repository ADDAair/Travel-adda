// Two kinds of leader (database step 017):
//  * agency       – has an own Hajj/Umrah agency: office details, Umrah/Hajj licence and the licence picture
//  * travel_adda  – works directly with Travel Adda: no office or licence; a picture of the national ID (NID) instead
// Both may give a profession (Imam, Muazzin, Madrasa teacher ...) and must give their work area.

import { tr } from './lang';

export type LeaderKind = { icon: string; title: string; what: string; badge?: string };
export const LEADER_KINDS: Record<string, LeaderKind> = {
  agency: { icon: '🏢', get title() { return tr('আমার নিজের এজেন্সি আছে', 'I have my own agency'); }, get what() { return tr('হজ/ওমরাহ এজেন্সির নাম, লাইসেন্স নম্বর ও লাইসেন্সের ছবি দিতে হবে।', 'You must give the Hajj/Umrah agency\'s name, licence number and a picture of the licence.'); } },
  travel_adda: { icon: '🤝', get title() { return tr('আমি Travel Adda-র সাথে সরাসরি কাজ করব', 'I will work directly with Travel Adda'); }, get what() { return tr('অফিস বা লাইসেন্স লাগবে না। জাতীয় পরিচয়পত্রের (NID) ছবি দিতে হবে।', 'No office or licence needed. You must give a picture of your national ID card (NID).'); }, get badge() { return tr('✅ Travel Adda-র নিজস্ব লিডার', "✅ Travel Adda's own leader"); } },
};

// The saved value stays Bengali (like district names); the name shown follows the language.
export const PROFESSIONS = [
  'ইমাম', 'খতিব', 'মুয়াজ্জিন', 'মাদ্রাসার শিক্ষক', 'আলেম / মুফতি', 'হাফেজ', 'স্কুল-কলেজের শিক্ষক',   // i18n-ok: saved value
  'ব্যবসায়ী', 'চাকরিজীবী', 'অবসরপ্রাপ্ত', 'শুধু হজ-ওমরাহ লিডার',   // i18n-ok: saved value
];
export const PROFESSIONS_EN = ['Imam', 'Khatib', 'Muezzin', 'Madrasa teacher', 'Alim / Mufti', 'Hafiz', 'School or college teacher',
  'Businessman', 'Employee', 'Retired', 'Hajj-Umrah leader only'];
export const professionName = (v: string | null | undefined): string => {
  const x = String(v || ''); const k = PROFESSIONS.indexOf(x);
  return k >= 0 ? tr(x, PROFESSIONS_EN[k]) : x;
};

// "Travel Adda" in any spelling: only Travel Adda's own leaders may show it (the database blocks it too).
export const isReservedAgencyName = (name: unknown): boolean => /travel[\s\-_.]*adda|ট্রাভেল[\s\-_.]*আড্ডা/i.test(String(name || ''));   // i18n-ok: the name in both scripts

const clean = (s: unknown): string => String(s || '').trim();

// Returns { field: 'Bengali message' } for every problem; {} when the form can be sent.
export type WorkArea = { district?: string | null; upazila?: string | null; union?: string | null };
export type ApplicationForm = { kind: string; agency?: string; umrah?: string; hajj?: string; area?: WorkArea; file?: unknown;
  agreed?: boolean; termsExist?: boolean; profession?: string | null; docPath?: string | null };
export function validateApplication({ kind, agency, umrah, hajj, area = {}, file, agreed, termsExist }: ApplicationForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!LEADER_KINDS[kind]) { e.kind = tr('আপনি কোন ধরনের লিডার, সেটি বাছুন।', 'Choose what kind of leader you are.'); return e; }
  if (kind === 'agency') {
    if (clean(agency).length < 2) e.agency = tr('এজেন্সির নাম লিখুন।', 'Write the agency\'s name.');
    else if (isReservedAgencyName(agency)) e.agency = tr('এজেন্সির নামে "Travel Adda" ব্যবহার করা যাবে না। Travel Adda-র সাথে সরাসরি কাজ করলে ওপরে সেই ধরনটি বাছুন।', '"Travel Adda" cannot be used in the agency name. If you work directly with Travel Adda, choose that kind above.');
    if (!clean(umrah) && !clean(hajj)) e.umrah = tr('ওমরাহ বা হজ, অন্তত একটি লাইসেন্স নম্বর লিখুন।', 'Write at least one licence number, Umrah or Hajj.');
    if (!file) e.file = tr('লাইসেন্সের ছবি বা PDF দিন।', 'Give a picture or PDF of the licence.');
  } else if (!file) {
    e.file = tr('জাতীয় পরিচয়পত্রের (NID) ছবি দিন।', 'Give a picture of your national ID card (NID).');
  }
  if (!area.district) e.district = tr('যে জেলায় কাজ করেন, সেটি বাছুন।', 'Choose the district where you work.');
  if (!clean(area.upazila)) e.upazila = tr('উপজেলা বাছুন।', 'Choose the upazila.');
  if (clean(area.union).length < 2) e.union = tr('ইউনিয়নের নাম লিখুন।', 'Write the union\'s name.');
  if (termsExist && !agreed) e.agree = tr('লিডারদের শর্তাবলি পড়ে টিক দিন।', 'Read the terms for leaders and tick the box.');
  return e;
}

// The row for leader_applications. A Travel Adda leader sends no office/licence data at all.
export function applicationRow({ kind, agency, umrah, hajj, area = {}, profession, docPath }: ApplicationForm): Record<string, string | null> {
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
