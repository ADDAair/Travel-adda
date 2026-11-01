// Named shapes of server rows, taken from the generated database types (src/lib/dbTypes.ts), so pages know exactly
// which fields a contract, a package or a notification has.
import type { RpcRow, Tables } from './dbTypes';

export type MyContract = RpcRow<'my_contracts'>;              // a haji's contract (with the leader's details)
export type LeaderContract = RpcRow<'leader_contracts'>;      // a leader's contract (with the haji's details)
export type AnyContract = Partial<MyContract> & Partial<LeaderContract> & { id: string };

export type PackageRow = RpcRow<'list_offers'>;               // a package as hajis see it (with the leader's box)
export type OwnPackage = Tables['offers'];                    // a leader's own package row
export type ReviewPackage = RpcRow<'admin_offers_review'>;    // a package in the admin check
export type AnyPackage = Partial<PackageRow> & Partial<OwnPackage> & Partial<ReviewPackage> & { id: string };

export type NotificationRow = RpcRow<'my_notifications'>;
