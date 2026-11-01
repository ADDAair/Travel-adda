// Shared small types for screens (navigation and server rows), until the database has generated types.
export type Row = Record<string, any>;   // a server row
export type Msg = { kind: 'ok' | 'bad' | 'warn' | 'info'; text: string } | null;
export type Nav = {
  navigate: (route: string, params?: object) => void;
  addListener?: (event: string, cb: () => void) => () => void;
  goBack?: () => void;
  setOptions?: (o: object) => void;
  setParams?: (params: object) => void;
};
export type Route<P extends object = Record<string, any>> = { params?: P };
