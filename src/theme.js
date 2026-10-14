// Design tokens. Every screen uses these so the app looks and behaves the same everywhere.
export const C = {
  primary: '#005C36',      // brand green
  primaryDark: '#00432A',
  gold: '#D4AF37',         // accent: use as background with dark text, never as text on white
  goldSoft: '#FBF4DC',
  bg: '#F6F7F5',
  card: '#FFFFFF',
  text: '#1A1A1A',
  muted: '#4A5650',        // secondary text, 7:1 on white
  line: '#D5DBD7',
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
