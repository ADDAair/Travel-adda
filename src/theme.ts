import * as SecureStore from 'expo-secure-store';
// Design tokens. Every screen uses these so the app looks and behaves the same everywhere.
export const C = {
  // আমি হাজী brand (from the logo, Nov 2026): green + gold. Every text/background pair is checked in tests/unit/theme_colors.
  primary: '#0B5D4B',      // brand green
  primaryDark: '#08473A',
  primarySoft: '#E2EFEA',  // selected backgrounds
  onPrimarySoft: '#D5E9E2',// soft text on green
  accent: '#E6C77E',       // light gold: fills, bars and borders with green or dark text, never text on white
  accentSoft: '#F8F0DC',
  gold: '#C9A24A',         // logo gold: frames, the dua button (with dark text), Islamic accents
  goldSoft: '#F6EDD3',
  bg: '#F6F4EE',
  card: '#FFFFFF',
  text: '#14231F',
  muted: '#46564F',        // secondary text, 7:1+ on white
  line: '#D9DFD9',
  ok: '#2E7D32', okSoft: '#E8F5E9',
  warn: '#ED6C02', warnSoft: '#FFF3E0',
  bad: '#C62828', badSoft: '#FDECEA',
  onPrimary: '#FFFFFF',
};
// Text size chosen on the "আমার তথ্য" page (1 = normal). Read synchronously at start-up, so the whole app uses it.
export const TEXT_SCALE_KEY = 'ta_text_scale';
let k = 1;
try { const n = Number(SecureStore.getItem ? SecureStore.getItem(TEXT_SCALE_KEY) : NaN); if (n >= 1 && n <= 1.4) k = n; } catch (e) { k = 1; }
export const TEXT_SCALE = k;
const z = (n: number): number => Math.round(n * k);
export const F = { small: z(16), body: z(18), large: z(20), title: z(24), hero: z(28) };   // font sizes
export const S = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };                  // spacing
export const R = { sm: 10, md: 14, lg: 20, pill: 999 };                       // corner radius
export const TOUCH = 48;     // minimum touch target (dp)
export const BTN_H = 60;     // primary button height
export const shadow = { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 };
