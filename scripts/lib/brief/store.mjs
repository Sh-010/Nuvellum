// Storage for the Nuvellum Brief. Subscribers live in a private Redis database (Upstash, free tier, connected
// through the Vercel Marketplace): never in GitHub, public files or the browser. Only the handful of commands
// the Brief needs are used, over Upstash's HTTPS REST API, so there is no client library to install.
//
// Environment (set by the Vercel ↔ Upstash integration; either naming works):
//   KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

export function redisConfig(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '';
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '';
  return { ok: /^https:\/\/[^/\s]+/.test(url) && token.length >= 20, url: url.replace(/\/+$/, ''), token };
}

export class StoreError extends Error {}

/** Upstash REST client: run(cmd) for one command, pipeline(cmds) for several in one round trip. */
export function createUpstash({ url, token, fetchImpl = fetch }) {
  const call = async (path, body) => {
    let res;
    try {
      res = await fetchImpl(`${url}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch { throw new StoreError('The subscriber store could not be reached.'); }
    if (!res.ok) throw new StoreError(`The subscriber store refused the request (${res.status}).`);
    return res.json();
  };
  return {
    async run(cmd) { const r = await call('', cmd); if (r.error) throw new StoreError('The subscriber store reported an error.'); return r.result; },
    async pipeline(cmds) {
      if (!cmds.length) return [];
      const rs = await call('/pipeline', cmds);
      return rs.map((r) => { if (r.error) throw new StoreError('The subscriber store reported an error.'); return r.result; });
    }
  };
}

/** In-memory Redis subset with the same interface (tests and local development). */
export function createMemoryStore({ now = () => Date.now() } = {}) {
  const kv = new Map(), zsets = new Map(), expiry = new Map();
  const alive = (k) => { const e = expiry.get(k); if (e != null && e <= now()) { kv.delete(k); expiry.delete(k); } return kv.has(k); };
  const exec = (cmd) => {
    const [op, ...a] = cmd.map(String), OP = op.toUpperCase();
    switch (OP) {
      case 'GET': return alive(a[0]) ? kv.get(a[0]) : null;
      case 'SET': {
        const nx = a.includes('NX'), ex = a.indexOf('EX');
        if (nx && alive(a[0])) return null;
        kv.set(a[0], a[1]); if (ex > 0) expiry.set(a[0], now() + Number(a[ex + 1]) * 1000); else expiry.delete(a[0]);
        return 'OK';
      }
      case 'MGET': return a.map((k) => (alive(k) ? kv.get(k) : null));
      case 'INCR': { const v = (alive(a[0]) ? Number(kv.get(a[0])) : 0) + 1; kv.set(a[0], String(v)); return v; }
      case 'EXPIRE': if (!alive(a[0])) return 0; expiry.set(a[0], now() + Number(a[1]) * 1000); return 1;
      case 'ZADD': { const z = zsets.get(a[0]) || new Map(); zsets.set(a[0], z); const added = z.has(a[2]) ? 0 : 1; z.set(a[2], Number(a[1])); return added; }
      case 'ZCARD': return zsets.get(a[0])?.size || 0;
      case 'ZREVRANGE': {
        const z = [...(zsets.get(a[0]) || new Map())].sort((x, y) => y[1] - x[1] || (y[0] < x[0] ? -1 : 1)).map(([m]) => m);
        const stop = Number(a[2]); return z.slice(Number(a[1]), stop < 0 ? z.length + stop + 1 : stop + 1);
      }
      default: throw new StoreError(`unsupported command ${OP}`);
    }
  };
  return { async run(cmd) { return exec(cmd); }, async pipeline(cmds) { return cmds.map(exec); }, _dump: () => ({ kv, zsets }) };
}
