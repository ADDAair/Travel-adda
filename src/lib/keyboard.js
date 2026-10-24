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
