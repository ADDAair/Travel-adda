// Phone: the real SQLite database (expo-sqlite). All the logic is in localdbCore.ts.
import * as SQLite from 'expo-sqlite';
import { setOpener, type Db } from './localdbCore';

setOpener(async () => (await SQLite.openDatabaseAsync('amihaji-local.db')) as unknown as Db);
export * from './localdbCore';
