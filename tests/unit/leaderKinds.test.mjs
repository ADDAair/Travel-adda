// Leader types (own agency vs Travel Adda's own leader) and profession — written BEFORE src/lib/leaderKinds.js (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROFESSIONS, LEADER_KINDS, isReservedAgencyName, validateApplication, applicationRow } from '../../src/lib/leaderKinds.js';

const area = { district: 'নোয়াখালী', upazila: 'কোম্পানীগঞ্জ', union: 'চরহাজারী' };
const file = { uri: 'x', kind: 'image', name: 'a.jpg' };

test('profession list has the common ones and allows typing another', () => {
  for (const p of ['ইমাম', 'খতিব', 'মুয়াজ্জিন', 'মাদ্রাসার শিক্ষক']) assert.ok(PROFESSIONS.includes(p), p);
  assert.equal(new Set(PROFESSIONS).size, PROFESSIONS.length);
  assert.deepEqual(Object.keys(LEADER_KINDS).sort(), ['agency', 'travel_adda']);
  assert.ok(LEADER_KINDS.travel_adda.badge.includes('Travel Adda'));
});

test('an agency may not use the Travel Adda name in any spelling', () => {
  for (const n of ['Travel Adda', 'TRAVEL ADDA Ltd', 'traveladda', 'Travel-Adda Tours', 'ট্রাভেল আড্ডা', 'ট্রাভেলআড্ডা']) assert.ok(isReservedAgencyName(n), n);
  for (const n of ['Al Haramain', 'Adda Tours', 'Travel Point']) assert.ok(!isReservedAgencyName(n), n);
});

test('Travel Adda leader: no office questions, NID picture needed', () => {
  const ok = validateApplication({ kind: 'travel_adda', area, file, agreed: true, termsExist: true });
  assert.deepEqual(ok, {});
  const e = validateApplication({ kind: 'travel_adda', area, file: null, agreed: true, termsExist: true });
  assert.ok(e.file && e.file.includes('পরিচয়পত্র'), e.file);
  assert.ok(!('agency' in e) && !('umrah' in e));
});

test('agency leader: name, at least one licence and the licence picture; reserved name refused', () => {
  const base = { kind: 'agency', agency: 'Al Haramain', umrah: 'U-1', hajj: '', area, file, agreed: true, termsExist: true };
  assert.deepEqual(validateApplication(base), {});
  assert.ok(validateApplication({ ...base, agency: 'A' }).agency);
  assert.ok(validateApplication({ ...base, umrah: '', hajj: '' }).umrah);
  assert.ok(validateApplication({ ...base, file: null }).file.includes('লাইসেন্স'));
  assert.ok(validateApplication({ ...base, agency: 'Travel Adda' }).agency.includes('Travel Adda'));
});

test('both kinds: work area complete, terms ticked, kind chosen', () => {
  assert.ok(validateApplication({ kind: 'travel_adda', area: { ...area, upazila: '' }, file, agreed: true }).upazila);
  assert.ok(validateApplication({ kind: 'travel_adda', area, file, agreed: false, termsExist: true }).agree);
  assert.ok(!validateApplication({ kind: 'travel_adda', area, file, agreed: false, termsExist: false }).agree);
  assert.ok(validateApplication({ kind: null, area, file }).kind);
});

test('row sent to the server: only what the kind needs; profession trimmed or empty', () => {
  const ta = applicationRow({ kind: 'travel_adda', agency: 'ignored', umrah: 'X', area, profession: '  ইমাম ', docPath: 'u/nid.jpg' });
  assert.deepEqual(ta, { leader_kind: 'travel_adda', profession: 'ইমাম', district: 'নোয়াখালী', upazila: 'কোম্পানীগঞ্জ', union_name: 'চরহাজারী', doc_path: 'u/nid.jpg' });
  const ag = applicationRow({ kind: 'agency', agency: ' Al Haramain ', umrah: ' U-1 ', hajj: '', area: { ...area, union: '' }, profession: '', docPath: 'u/l.jpg' });
  assert.deepEqual(ag, { leader_kind: 'agency', agency_name: 'Al Haramain', license_no: 'U-1', umrah_license: 'U-1', hajj_license: null, profession: null, district: 'নোয়াখালী', upazila: 'কোম্পানীগঞ্জ', union_name: null, doc_path: 'u/l.jpg' });
});
