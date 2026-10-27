// ScrollView that keeps the field being typed in above the keyboard. Since Expo SDK 55 Android draws the app behind
// the keyboard and no longer scrolls for us; KeyboardRoom (App.js) shrinks the page, this scrolls the field into view.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { ScrollView, Keyboard, TextInput, Platform } from 'react-native';
import { scrollToShow, onFieldFocus } from '../lib/keyboard';

const KbScroll = forwardRef(function KbScroll({ onScroll, scrollEventThrottle, ...props }, outer) {
  const ref = useRef(null);
  const y = useRef(0);
  const kbTop = useRef(0);
  useImperativeHandle(outer, () => ref.current);

  const ensure = useCallback(() => {
    const sv = ref.current; const input = TextInput.State.currentlyFocusedInput && TextInput.State.currentlyFocusedInput();
    if (!sv || !input || !kbTop.current || !input.measureInWindow || !sv.measureInWindow) return;
    sv.measureInWindow((vx, vy, vw, vh) => {
      if (!vw || !vh) return;                                      // this page is not on screen (another tab)
      input.measureInWindow((fx, fy, fw, fh) => {
        if (!fh || fy < vy - 1) return;                            // the field is not inside this page
        const d = scrollToShow({ fieldTop: fy, fieldBottom: fy + fh, keyboardTop: kbTop.current, viewTop: vy });
        if (d > 0) ref.current?.scrollTo({ y: y.current + d, animated: true });
      });
    });
  }, []);

  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const timers = [];
    const later = () => { timers.push(setTimeout(ensure, 120)); timers.push(setTimeout(ensure, 400)); };   // after the page has shrunk
    const a = Keyboard.addListener(showEv, (e) => { kbTop.current = e?.endCoordinates?.screenY || 0; later(); });
    const b = Keyboard.addListener(hideEv, () => { kbTop.current = 0; });
    const c = onFieldFocus(() => { if (kbTop.current) later(); });   // moving to the next field while typing
    return () => { a.remove(); b.remove(); c(); timers.forEach(clearTimeout); };
  }, [ensure]);

  return (
    <ScrollView ref={ref} {...props} scrollEventThrottle={scrollEventThrottle || 16}
      onScroll={(e) => { y.current = e.nativeEvent.contentOffset.y; if (onScroll) onScroll(e); }} />
  );
});
export default KbScroll;
