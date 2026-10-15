// Design tokens. Every screen uses these so the app looks and behaves the same everywhere.
export const C = {
  primary: '#001952',      // brand navy (Travel Adda)
  primaryDark: '#000F33',
  primarySoft: '#E6EBF5',  // selected backgrounds
  onPrimarySoft: '#DCE3F2',// soft text on navy
  accent: '#FF7C06',       // brand orange: backgrounds/borders/bars with navy text, never small text on white
  accentSoft: '#FFF1E5',
  gold: '#D4AF37',         // Islamic accents (dua button, numbers): background with dark text
  goldSoft: '#FBF4DC',
  bg: '#F5F7FB',
  card: '#FFFFFF',
  text: '#141A2B',
  muted: '#4A5468',        // secondary text, 7:1+ on white
  line: '#D6DCE8',
  ok: '#2E7D32', okSoft: '#E8F5E9',
  warn: '#ED6C02', warnSoft: '#FFF3E0',
  bad: '#C62828', badSoft: '#FDECEA',
  onPrimary: '#FFFFFF',
};
export const F = { small: 16, body: 18, large: 20, title: 24, hero: 28 };   // font sizes
export const S = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };                  // spacing
export const R = { sm: 10, md: 14, lg: 20, pill: 999 };                       // corner radius
export const TOUCH = 48;     // minimum touch target (dp)
export const BTN_H = 60;     // primary button height
export const shadow = { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 };
