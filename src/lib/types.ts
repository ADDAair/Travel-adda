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
