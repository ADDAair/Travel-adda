// Qibla compass helpers (the direction itself is qiblaBearing in prayer.ts). A phone's raw compass jumps by several
// degrees, so readings are smoothed, and "you face the qibla" switches on and off at different points (no flicker).

const norm = (a: number): number => ((a % 360) + 360) % 360;
// Shortest signed angle from a to b, -180..180 (+ = clockwise / to the right).
const delta = (a: number, b: number): number => ((b - a + 540) % 360) - 180;

// Moves the shown heading part of the way to the new reading, the short way round (355° → 5° passes 0°, not 180°).
export function smoothHeading(prev: number | null | undefined, next: number, factor = 0.2): number {
  if (!Number.isFinite(next)) return prev == null ? NaN : prev;
  if (prev == null || !Number.isFinite(prev)) return norm(next);
  return norm(prev + delta(prev, next) * factor);
}

export const ALIGN_ON = 5;     // within 5° → "আপনি এখন কিবলামুখী"
export const ALIGN_OFF = 9;    // once facing, stays until more than 9° off
export function qiblaTurn(qibla: number, heading: number, wasAligned: boolean): { side: 'right' | 'left'; deg: number; aligned: boolean } {
  const d = delta(heading, qibla);
  const abs = Math.abs(d);
  return { side: d > 0 ? 'right' : 'left', deg: Math.round(abs), aligned: abs <= (wasAligned ? ALIGN_OFF : ALIGN_ON) };
}

// Android gives the compass state 0–3 (3 = best); iPhone gives the possible error in degrees (negative = unknown).
export function compassWeak(accuracy: number | null | undefined, platform: string): boolean {
  if (accuracy == null || !Number.isFinite(accuracy)) return false;
  if (platform === 'ios') return accuracy < 0 || accuracy > 20;
  return accuracy < 2;
}
