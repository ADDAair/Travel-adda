// Shapes of the bundled content (duas, guides). Admin overrides (app_content table) must keep the same shape.
import type { NoticeKind } from '../components/ui';
import type { Step } from '../components/guide';

export type DuaPart = { label?: string; ar: string; pron: string; bn: string };
export type Dua = { id: string; cat: string; title: string; when: string; parts: DuaPart[]; source: string; note?: string };

export type Phrase = { bn: string; ar: string; pron: string; note?: string };
export type CheckItem = { id: string; group: string; text: string };
export type Place = { name: string; what: string; tip?: string; source?: string; duas?: string[] };
export type PlaceGroup = { title: string; items: Place[] };

export type GuideBlock =
  | { type: 'notice'; kind: NoticeKind; title: string; text?: string }
  | { type: 'source'; text: string }
  | { type: 'link'; route: string; icon?: string; title: string; text?: string }
  | { type: 'steps'; steps: Step[] }
  | { type: 'phrases'; items: Phrase[] }
  | { type: 'checklist'; key: string; items: CheckItem[] }
  | { type: 'places'; groups: PlaceGroup[] };

export type Guide = { id: string; icon: string; title: string; what: string; blocks: GuideBlock[] };

export type RakatKind = 'sm' | 'sg' | 'fard' | 'wajib' | 'nafl';
export type RakatRow = { n: number; kind: RakatKind; when?: string };
export type KindInfo = { label: string; hint: string; color: string };
export type SalahBlock =
  | GuideBlock
  | { type: 'rakat'; rows: RakatRow[] }
  | { type: 'duas'; ids: string[] }
  | { type: 'kahf' }
  | { type: 'history'; items: Step[] };   // 📜 ইতিহাস: when and how the prayer began, each item with its source
export type SalahSection = { id: string; icon: string; title: string; what: string; blocks: SalahBlock[] };
