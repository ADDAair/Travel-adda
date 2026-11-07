// Offline step 2: does this phone reach the server right now? Learned from the app's own server requests (owner's
// choice: no extra package). Any answer from the server = online; a request that fails without an answer = offline.
import { tr } from './lang';

let offline = false;
const listeners = new Set<(off: boolean) => void>();

export const isOffline = (): boolean => offline;
function set(v: boolean): void {
  if (offline === v) return;
  offline = v;
  for (const f of [...listeners]) { try { f(v); } catch (e) { /* one listener never breaks the others */ } }
}
export const markOffline = (): void => set(true);
export const markOnline = (): void => set(false);
export function onNetChange(f: (off: boolean) => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
/** Wraps fetch for the Supabase client: notes online/offline from every request, changes nothing else. */
export function trackedFetch(f: Fetch = (...a) => fetch(...a)): Fetch {
  return async (input, init) => {
    try {
      const r = await f(input, init);
      markOnline();
      return r;
    } catch (e) {
      if (!init?.signal?.aborted) markOffline();
      throw e;
    }
  };
}

export const netStripText = (): string => tr('📶 ইন্টারনেট নেই। আগের তথ্য দেখা যাবে; নতুন কিছু পাঠাতে ইন্টারনেট লাগবে।',
  '📶 No internet. Earlier details can be seen; sending anything new needs internet.');
