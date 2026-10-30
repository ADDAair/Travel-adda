// How long the last app start took, step by step (owner: "opening the app feels slow"). Shown on the admin speed page.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toBn } from './phone';

const KEY = 'ta.lastStartup.v1';
type Clock = () => number;
export type Step = { name: string; ms: number };
export type Startup = { at: string; steps: Step[]; total: number };

let t0: number | null = null;
let steps: Step[] = [];
let done = false;

export function markStart(now: Clock = Date.now): void { t0 = now(); steps = []; done = false; }
export function mark(name: string, now: Clock = Date.now): void {
  if (t0 == null || done || steps.some((s) => s.name === name)) return;
  steps.push({ name, ms: Math.round(now() - t0) });
}
export async function finishStartup(name = 'home', now: Clock = Date.now): Promise<void> {
  if (t0 == null || done) return;
  mark(name, now); done = true;
  const s: Startup = { at: new Date().toISOString(), steps, total: steps.length ? steps[steps.length - 1].ms : 0 };
  try { await AsyncStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* only a measurement */ }
}
export async function lastStartup(): Promise<Startup | null> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || 'null') as Startup | null; } catch (e) { return null; }
}

const NAMES: Record<string, string> = { session: 'লগইন যাচাই', photo: 'ছবি যাচাই', me: 'আমার তথ্য', home: 'হোম পাতা দেখা গেল' };
const sec = (ms: number): string => toBn((ms / 1000).toFixed(1));
export function startupText(s: Startup | null): string {
  if (!s) return 'এখনো মাপা হয়নি। অ্যাপ বন্ধ করে আবার খুলুন।';
  return `শেষবার অ্যাপ খুলতে মোট ${sec(s.total)} সেকেন্ড লেগেছে:\n` + s.steps.map((x) => `• ${NAMES[x.name] || x.name}: ${sec(x.ms)} সেকেন্ডে`).join('\n');
}
