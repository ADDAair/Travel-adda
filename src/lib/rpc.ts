// Shared helpers for talking to the database, typed. Every call throws on failure, so a screen never shows a false
// success. Server answers are typed by the caller (rpc<T>).
import { supabase } from './supabase';

export type DbError = { code?: string; message?: string; status?: number };
export type Coded = Error & { code: string };
export type DbResult<T> = { data: T | null; error: DbError | null };

type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<DbResult<unknown>> };
const client = supabase as unknown as RpcClient;

export const fail = (code: string): Coded => Object.assign(new Error(code), { code });

export function check<T>(r: DbResult<T>): T | null {
  if (r.error) throw r.error;
  return r.data;
}

export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T | null> {
  return check(await client.rpc(fn, args)) as T | null;
}
