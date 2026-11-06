// How long the last app start took, step by step (owner: "opening the app feels slow"). Shown on the admin speed page.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tr } from './lang';
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

const NAMES: Record<string, string> = { get session() { return tr('লগইন যাচাই', 'Login check'); }, get photo() { return tr('ছবি যাচাই', 'Photo check'); }, get me() { return tr('আমার তথ্য', 'My info'); }, get home() { return tr('হোম পাতা দেখা গেল', 'Home page shown'); } };
const sec = (ms: number): string => toBn((ms / 1000).toFixed(1));
export function startupText(s: Startup | null): string {
  if (!s) return tr('এখনো মাপা হয়নি। অ্যাপ বন্ধ করে আবার খুলুন।', 'Not measured yet. Close the app and open it again.');
  return tr(`শেষবার অ্যাপ খুলতে মোট ${sec(s.total)} সেকেন্ড লেগেছে:\n`, `The app last took ${sec(s.total)} seconds in all to open:\n`) + s.steps.map((x) => tr(`• ${NAMES[x.name] || x.name}: ${sec(x.ms)} সেকেন্ডে`, `• ${NAMES[x.name] || x.name}: ${sec(x.ms)} seconds`)).join('\n');
}
