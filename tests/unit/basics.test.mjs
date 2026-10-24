// Unit tests for small, pure helpers. Run: npm run test:unit  (or: node --import ./tests/unit/register.mjs --test tests/unit/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDigits, normalizePhone, isValidBdPhone, toBn } from '../../src/lib/phone.js';
import { passwordStrength } from '../../src/lib/password.js';
import { parseDate, ymdToInput } from '../../src/lib/dates.js';
import { UPAZILAS, upazilasOf } from '../../src/lib/upazilas.js';
import { refOf, daysOf, cleanHelpline } from '../../src/lib/offers.js';
import { methodLabel } from '../../src/lib/payments.js';
import { notReady, telBd } from '../../src/lib/groups.js';
import { DISTRICTS } from '../../src/lib/market.js';

test('phone: Bengali digits, +880 and spaces are understood', () => {
  assert.equal(normalizeDigits('০১৭ ১২-৩৪'), '0171234');
  assert.equal(normalizePhone('+880 1712-345678'), '01712345678');
  assert.equal(normalizePhone('8801712345678'), '01712345678');
  assert.equal(normalizePhone('০১৭১২৩৪৫৬৭৮'), '01712345678');
  assert.ok(isValidBdPhone('01712345678'));
  for (const bad of ['0171234567', '01212345678', '1712345678', '017123456789', '']) assert.ok(!isValidBdPhone(bad), bad);
  assert.equal(toBn('2026'), '২০২৬');
});

test('password: too short / easy / own phone are refused; mixed long is strong', () => {
  assert.equal(passwordStrength('abc').level, 0);
  assert.equal(passwordStrength('12345678').level, 0);
  assert.equal(passwordStrength('11111111').level, 0);
  assert.equal(passwordStrength('87654321').level, 0);
  assert.equal(passwordStrength('01712345678', '01712345678').level, 0);
  assert.equal(passwordStrength('Password').level, 0);
  assert.equal(passwordStrength('karim2026').level, 1);
  assert.equal(passwordStrength('karim2026!').level, 2);
  assert.equal(passwordStrength('karimuddin2026').level, 2);
});

test('dates: day-month-year in both digit sets, impossible dates refused', () => {
  assert.equal(parseDate('20-05-2027'), '2027-05-20');
  assert.equal(parseDate('২০/০৫/২০২৭'), '2027-05-20');
  assert.equal(parseDate('2027-5-2'), '2027-05-02');
  assert.equal(parseDate(''), '');
  assert.equal(parseDate('31-02-2027'), null);
  assert.equal(parseDate('20-05-2020'), null);       // before minYear
  assert.equal(parseDate('hello'), null);
  assert.equal(ymdToInput('2027-05-20'), '২০-০৫-২০২৭');
});

test('work area data: every district has its upazilas, no duplicates, Bengali only', () => {
  assert.equal(DISTRICTS.length, 64);
  for (const d of DISTRICTS) {
    const u = upazilasOf(d);
    assert.ok(u.length >= 3, `${d} has ${u.length}`);
    assert.equal(new Set(u).size, u.length, `${d} has duplicates`);
    for (const x of u) assert.ok(!/[A-Za-z0-9]/.test(x), `${d}: ${x}`);
  }
  assert.equal(Object.keys(UPAZILAS).length, 64);
  assert.equal(Object.values(UPAZILAS).flat().length, 495);
  assert.ok(upazilasOf('নোয়াখালী').includes('কোম্পানীগঞ্জ'));
  assert.ok(upazilasOf('হবিগঞ্জ').includes('শায়েস্তাগঞ্জ'));
  assert.deepEqual(upazilasOf('নেই এমন জেলা'), []);
});

test('offers, payments, groups helpers', () => {
  assert.equal(refOf('3fa9c2d1-aaaa-bbbb'), '3FA9C2');
  assert.equal(daysOf({ depart_on: '2027-01-10', return_on: '2027-01-24' }), 15);
  assert.equal(cleanHelpline('০১৭১২-৩৪৫ ৬৭৮'), '01712345678');
  assert.equal(methodLabel('bkash'), 'বিকাশ');
  assert.equal(methodLabel('xyz'), 'xyz');
  assert.equal(telBd('01712345678'), '+8801712345678');
  assert.equal(telBd('+966500000000'), '+966500000000');
  assert.ok(notReady({ code: 'PGRST202' }));
  assert.ok(notReady({ message: 'relation "x" does not exist' }));
  assert.ok(!notReady({ code: '42501', message: 'permission denied' }));
});
