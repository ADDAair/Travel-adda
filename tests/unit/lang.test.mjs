// Owner request (Nov 2026): English for the whole app, with a language choice at first start, in the green bar and
// on the account page. Step 1: the language core, the chooser, tabs, login and Home. Written first (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bn, en } from '../../src/strings.js';
import * as S from '../../src/strings.js';
import { setLang, getLang, loadLang, deviceLang, LANG_KEY } from '../../src/lib/lang.js';
import { toBn } from '../../src/lib/phone.js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const BENGALI = /[ঀ-৿]/;
beforeEach(async () => { await setLang('bn'); });

// every key of the Bengali dictionary exists in English with the same kind (text or function), and the reverse
function same(a, b, path = '') {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = `${path}.${k}`;
    assert.ok(k in a, `missing in Bengali: ${p}`); assert.ok(k in b, `missing in English: ${p}`);
    assert.equal(typeof a[k], typeof b[k], `different kind: ${p}`);
    if (typeof a[k] === 'object') same(a[k], b[k], p);
    if (typeof a[k] === 'function') assert.equal(a[k].length, b[k].length, `different inputs: ${p}`);
  }
}
const texts = (o, out = []) => { for (const v of Object.values(o)) { if (typeof v === 'string') out.push(v); else if (typeof v === 'object') texts(v, out); } return out; };

test('English has every text the Bengali has (nothing missing, nothing extra)', () => same(bn, en));

test('English texts are really English (no Bengali letters left), and none is empty', () => {
  for (const t of texts(en)) { assert.ok(!BENGALI.test(t), `Bengali left in English: ${t}`); assert.ok(t.trim().length > 0); }
});

test('switching language changes T at once and is kept on the phone', async () => {
  assert.equal(S.T.tabs.Home, 'হোম');
  await setLang('en');
  assert.equal(getLang(), 'en'); assert.equal(S.T.tabs.Home, 'Home');
  assert.equal(await AsyncStorage.getItem(LANG_KEY), 'en');
  await setLang('bn');
  assert.equal(S.T.tabs.Home, 'হোম'); assert.equal(await AsyncStorage.getItem(LANG_KEY), 'bn');
});

test('first start: no saved choice gives null (the app then asks); a saved choice is used', async () => {
  await AsyncStorage.removeItem(LANG_KEY);
  assert.equal(await loadLang(), null);
  await AsyncStorage.setItem(LANG_KEY, 'en');
  assert.equal(await loadLang(), 'en'); assert.equal(S.T.tabs.Home, 'Home');
  await AsyncStorage.setItem(LANG_KEY, 'xx');
  assert.equal(await loadLang(), null, 'unknown value: ask again');
});

test('the suggested language follows the phone: English phone → English, everything else → Bengali', () => {
  assert.equal(deviceLang('en-US'), 'en'); assert.equal(deviceLang('en-GB'), 'en');
  assert.equal(deviceLang('bn-BD'), 'bn'); assert.equal(deviceLang('ar-SA'), 'bn'); assert.equal(deviceLang(''), 'bn');
});

test('numbers follow the language: Bengali digits in Bengali, normal digits in English', async () => {
  assert.equal(toBn(2027), '২০২৭');
  await setLang('en'); assert.equal(toBn(2027), '2027');
});

test('the app asks for the language before anything else, and has the switch in the green bar and on the account page', () => {
  const a = read('App.tsx');
  assert.ok(/lang === null[\s\S]{0,60}<LanguageChoice/.test(a), 'first start: language choice');
  assert.ok(a.indexOf('<LanguageChoice') < a.indexOf('<Onboarding'), 'before the tutorial');
  assert.ok(a.includes('<LangButton'), 'switch next to the bell');
  assert.ok(a.includes('key={lang'), 'the screens are drawn again in the new language');
  assert.ok(read('src/screens/Placeholder.tsx').includes('<LangSwitch'), 'account page option');
  const c = read('src/components/LangButton.tsx');
  assert.ok(c.includes('accessibilityLabel') && c.includes('minWidth: TOUCH'), 'big enough and read aloud');
});

test('step 1 pages have no Bengali written inside them any more (all text comes from the dictionary)', () => {
  for (const f of ['App.tsx', 'src/screens/HomeScreen.tsx', 'src/screens/AuthScreen.tsx', 'src/screens/Onboarding.tsx', 'src/screens/VerifyPhoneScreen.tsx',
    'src/screens/ForgotPassword.tsx', 'src/screens/LanguageChoice.tsx', 'src/components/LangButton.tsx', 'src/components/Bell.tsx', 'src/components/NoticeBar.tsx',
    'src/components/TripSummary.tsx', 'src/components/TileGrid.tsx', 'src/components/PushCard.tsx']) {
    const code = read(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const hit = code.split('\n').find((l) => BENGALI.test(l));
    assert.equal(hit, undefined, `${f} still has Bengali: ${hit}`);
  }
});
