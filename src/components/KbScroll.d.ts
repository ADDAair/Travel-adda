// Types for KbScroll.js: a ScrollView that keeps the field being typed in above the keyboard.
import type { ComponentRef, ForwardRefExoticComponent, RefAttributes } from 'react';
import type { ScrollView, ScrollViewProps } from 'react-native';

// RN 0.88: ScrollView is a function component; its ref is the instance type below.
export type ScrollRef = ComponentRef<typeof ScrollView>;
declare const KbScroll: ForwardRefExoticComponent<ScrollViewProps & RefAttributes<ScrollRef>>;
export default KbScroll;
