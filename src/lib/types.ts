// Named shapes of server rows, taken from the generated database types (src/lib/dbTypes.ts), so pages know exactly
// which fields a contract, a package or a notification has.
import type { RpcRow, Tables } from './dbTypes';

// Every field optional and possibly empty: for pages that show rows coming from different server functions.
export type Loose<T> = { [K in keyof T]?: T[K] | null };

export type MyContract = RpcRow<'my_contracts'>;              // a haji's contract (with the leader's details)
export type LeaderContract = RpcRow<'leader_contracts'>;      // a leader's contract (with the haji's details)
export type AnyContract = Loose<MyContract & LeaderContract> & { id: string };

export type PackageRow = RpcRow<'list_offers'>;               // a package as hajis see it (with the leader's box)
export type OwnPackage = Tables['offers'];                    // a leader's own package row
export type ReviewPackage = RpcRow<'admin_offers_review'>;    // a package in the admin check
export type AnyPackage = Loose<PackageRow & OwnPackage & ReviewPackage> & { id: string };

export type NotificationRow = RpcRow<'my_notifications'>;

// Changes sent to a table (only known columns are allowed).
import type { Database } from './dbTypes';
export type TableUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type TableInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TableRow<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

// Admin detail pages (server functions that answer one JSON object; shapes from supabase/022_admin_tools.sql).
type Opt<T> = T | null | undefined;
export type ContractDetail = {
  contract_no: string; status: string; title: string; price_bdt: number; includes: string; excludes?: Opt<string>;
  refund_policy?: Opt<string>; extra_terms?: Opt<string>; cancel_reason?: Opt<string>; travel_from?: Opt<string>; travel_to?: Opt<string>;
  haji_name: string; haji_code: string; leader_name: string; leader_code: string; agency_name?: Opt<string>;
  payments?: Opt<{ amount: number; method: string; txn_ref: string; status: string; admin_note?: Opt<string> }[]>;
  payouts?: Opt<{ payee: 'leader' | 'haji'; amount: number; txn_ref: string; note?: Opt<string> }[]>;
  complaints?: Opt<{ status: string; body: string }[]>;
  rating?: Opt<{ stars: number; comment?: Opt<string>; hidden?: Opt<boolean> }>;
  notes?: Opt<{ created_at: string; author?: Opt<string>; note: string }[]>;
};
type Named = { name: string; status?: Opt<string>; active?: Opt<boolean> };
export type UserDetail = {
  full_name: string; code: string; account_type: string; status: string; phone?: Opt<string>; email?: Opt<string>; verified?: Opt<boolean>; created_at: string;
  leader?: Opt<{ agency?: Opt<string>; district?: Opt<string>; listed: boolean }>;
  contracts?: Opt<{ contract_no: string; status: string; title: string; price_bdt: number; as: 'haji' | 'leader'; other: string }[]>;
  payments?: Opt<{ amount: number; txn_ref: string; status: string }[]>;
  complaints_by?: Opt<{ status: string; body: string }[]>; complaints_against?: Opt<{ status: string; body: string }[]>;
  reports_against?: Opt<{ reason: string; details?: Opt<string>; status: string }[]>;
  groups?: Opt<Named[]>; leads_groups?: Opt<Named[]>; khadem_of?: Opt<Named[]>;
};

// What an async app function gives back, e.g. Res<typeof listLeaders>; Item<…> is one element of a list result.
export type Res<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;
export type Item<F extends (...a: never[]) => unknown> = NonNullable<Res<F>> extends readonly (infer T)[] ? T : never;
