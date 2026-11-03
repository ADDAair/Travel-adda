import React from 'react';
import { Image } from 'react-native';
// The "আমি হাজী" logo mark (Haram gate, a leader with hajis in ihram, the path from home), from the owner's logo design.
// The full logo with the name is in assets/brand/.
const MARK = require('../../assets/logo-mark.png');
export default function Logo({ size = 72 }: { size?: number }) {
  return (
    <Image source={MARK} accessible accessibilityRole="image" accessibilityLabel="আমি হাজী লোগো"
      style={{ width: Math.round(size * 0.66), height: size }} resizeMode="contain" />
  );
}
