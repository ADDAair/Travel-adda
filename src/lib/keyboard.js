import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
// Height of the on-screen keyboard (0 when hidden). Used to keep fields and buttons above it.
export function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEv, (e) => setH(e?.endCoordinates?.height || 0));
    const b = Keyboard.addListener(hideEv, () => setH(0));
    return () => { a.remove(); b.remove(); };
  }, []);
  return h;
}
// How much to shrink the screen while the keyboard is open (Android 15+ draws the app behind the keyboard).
export const keyboardPad = (h) => (Number.isFinite(h) && h > 0 ? Math.round(h) : 0);

// Space kept between the field being typed in and the top of the keyboard.
export const KB_GAP = 24;
// How far (px) a page must scroll so the field being typed in is fully above the keyboard. All values are positions
// on the screen. A tall field is scrolled only until its top reaches the top of the page (viewTop), never past it.
export function scrollToShow({ fieldTop, fieldBottom, keyboardTop, viewTop }) {
  if (![fieldTop, fieldBottom, keyboardTop, viewTop].every(Number.isFinite) || keyboardTop <= 0) return 0;
  const need = fieldBottom + KB_GAP - keyboardTop;
  if (need <= 0) return 0;
  return Math.max(0, Math.min(need, fieldTop - viewTop));
}

// Fields (components/ui Field) tell open pages when they get focus, so the page can scroll them into view.
const focusSubs = new Set();
export const onFieldFocus = (f) => { focusSubs.add(f); return () => focusSubs.delete(f); };
export const notifyFieldFocus = () => focusSubs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
