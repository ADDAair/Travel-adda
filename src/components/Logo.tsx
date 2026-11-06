import React from 'react';
import { tr } from '../lib/lang';
import { Image } from 'react-native';
// The "আমি হাজী" logo mark (Haram gate, a leader with hajis in ihram, the path from home), from the owner's logo design.
// The full logo with the name is in assets/brand/.
const MARK = require('../../assets/logo-mark.png');
// decorative: next to the written name (e.g. the green bar), so the screen reader does not say it twice.
export default function Logo({ size = 72, decorative = false }: { size?: number; decorative?: boolean }) {
  if (decorative) return <Image source={MARK} accessible={false} importantForAccessibility="no" style={{ width: Math.round(size * 0.66), height: size }} resizeMode="contain" />;
  return (
    <Image source={MARK} accessible accessibilityRole="image" accessibilityLabel={tr('আমি হাজী লোগো', 'Ami Haji logo')}
      style={{ width: Math.round(size * 0.66), height: size }} resizeMode="contain" />
  );
}
