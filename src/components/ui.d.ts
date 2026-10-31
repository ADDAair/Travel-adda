// Types for the shared UI pieces in ui.js, so TypeScript pages can use them (optional props are really optional).
import type { JSX, ReactNode, RefObject } from 'react';
import type { StyleProp, ViewStyle, TextInputProps, TextInput } from 'react-native';

export type ButtonKind = 'primary' | 'secondary' | 'gold' | 'danger';
export function Button(p: { title: string; onPress?: () => void; kind?: ButtonKind | string; loading?: boolean; disabled?: boolean;
  icon?: string; a11yHint?: string; style?: StyleProp<ViewStyle> }): JSX.Element;
export function Field(p: TextInputProps & { label: string; hint?: string; error?: string; right?: ReactNode; inputRef?: RefObject<TextInput | null> }): JSX.Element;
export function Notice(p: { kind?: 'ok' | 'warn' | 'bad' | 'info'; title: string; text?: string; children?: ReactNode }): JSX.Element;
export function Segmented<T extends string>(p: { options: { id: T; label: string; icon?: string }[]; value: T; onChange: (v: T) => void; disabled?: boolean }): JSX.Element;
export function Card(p: { children?: ReactNode; style?: StyleProp<ViewStyle>; [k: string]: unknown }): JSX.Element;
