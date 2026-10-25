// Fake Supabase client. Each test sets globalThis.__sb = { rpc(name, args), from(table), invoke(fn, opts), session }.
// Every call is recorded in globalThis.__sbCalls so tests can check what the app asked the server.
const calls = (globalThis.__sbCalls = globalThis.__sbCalls || []);
const cfg = () => globalThis.__sb || {};
const chain = (table) => {
  const q = { table, ops: [] };
  const done = () => (cfg().from ? cfg().from(table, q.ops) : { data: null, error: null });
  const p = new Proxy({}, {
    get(_t, k) {
      if (k === 'then') return (res, rej) => Promise.resolve(done()).then(res, rej);
      return (...a) => { q.ops.push([k, ...a]); return p; };
    },
  });
  calls.push(['from', table, q.ops]);
  return p;
};
export const supabase = {
  rpc: async (name, args) => { calls.push(['rpc', name, args]); return cfg().rpc ? cfg().rpc(name, args) : { data: null, error: null }; },
  from: chain,
  functions: { invoke: async (fn, opts) => { calls.push(['invoke', fn, opts]); return cfg().invoke ? cfg().invoke(fn, opts) : { data: null, error: null }; } },
  auth: {
    getSession: async () => ({ data: { session: cfg().session || null } }),
    signInWithPassword: async (a) => { calls.push(['signIn', a]); return cfg().signIn ? cfg().signIn(a) : { data: {}, error: null }; },
    signOut: async () => ({}),
    // 2FA (authenticator app). Tests set globalThis.__sb.mfa = { aal(), list(), enroll(a), unenroll(a), challenge(a), verify(a) }.
    mfa: new Proxy({}, { get(_t, k) {
      const map = { getAuthenticatorAssuranceLevel: 'aal', listFactors: 'list' };
      return async (a) => { calls.push(['mfa', k, a]); const f = (cfg().mfa || {})[map[k] || k]; return f ? f(a) : { data: null, error: null }; };
    } }),
  },
  storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({}), createSignedUrl: async () => ({ data: { signedUrl: 'x' } }), list: async () => ({ data: [] }) }) },
};
export const reset = () => { calls.length = 0; globalThis.__sb = {}; };
