// Types for DistrictPicker.js: a big searchable list (districts by default, or any list of names).
import type { JSX } from 'react';
export default function DistrictPicker(p: {
  label?: string; value?: string | null; onChange: (v: string) => void; allowAll?: boolean; error?: string;
  options?: readonly string[]; placeholder?: string; searchHint?: string; noun?: string;
  allowOther?: boolean; disabled?: boolean; disabledText?: string;
}): JSX.Element;
