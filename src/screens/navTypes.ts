// Shared small types for screens (navigation, messages). Server rows are typed from src/lib/dbTypes.ts (generated).
export type Msg = { kind: 'ok' | 'bad' | 'warn' | 'info'; text: string } | null;
export type Nav = {
  navigate: (route: string, params?: object) => void;
  addListener?: (event: string, cb: () => void) => () => void;
  goBack?: () => void;
  setOptions?: (o: object) => void;
  setParams?: (params: object) => void;
};
// Every parameter any screen is opened with (all optional; each screen reads only its own).
export type Params = {
  groupId?: string; groupName?: string; leader?: string; id?: string; tab?: string; channel?: string;
  section?: string; from?: string; t?: number; openSurah?: number; tutorialDone?: boolean;
};
export type Route<P extends object = Params> = { params?: P };
