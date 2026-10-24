// In-memory AsyncStorage. Tests read/clear it through globalThis.__store.
const m = (globalThis.__store = globalThis.__store || new Map());
export default {
  getItem: async (k) => (m.has(k) ? m.get(k) : null),
  setItem: async (k, v) => { m.set(k, String(v)); },
  removeItem: async (k) => { m.delete(k); },
  multiRemove: async (ks) => { ks.forEach((k) => m.delete(k)); },
  getAllKeys: async () => [...m.keys()],
  multiGet: async (ks) => ks.map((k) => [k, m.has(k) ? m.get(k) : null]),
};
