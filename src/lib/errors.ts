// Reads the code and message from any thrown error (Supabase, our own coded errors, or plain values) without `any`.
export type ErrInfo = { code: string; message: string };
export function errInfo(e: unknown): ErrInfo {
  const o = (e && typeof e === 'object' ? e : {}) as { code?: unknown; message?: unknown };
  return { code: o.code == null ? '' : String(o.code), message: o.message == null ? (typeof e === 'string' ? e : '') : String(o.message) };
}
