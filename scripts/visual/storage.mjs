// Storage abstraction for generated visuals. Raster images never go into Git.
//   memory       tests
//   local        development (NUVELLUM_VISUAL_DIR, default .visual-store/)
//   vercel-blob  production, when BLOB_READ_WRITE_TOKEN is set (REST API, no SDK dependency)
// Keys: visuals/{slug}/v{n}-{hash8}/{variant}.{ext}. Content-addressed, so re-uploading the same
// bytes is a no-op and the version history of an article stays auditable.
import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };

export function hash8(bytes) { return createHash('sha256').update(bytes).digest('hex').slice(0, 8); }

export function assetKey({ slug, version, bytes, variant = 'master', mime }) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`invalid slug ${slug}`);
  if (!Number.isInteger(version) || version < 1) throw new Error('version must be a positive integer');
  return `visuals/${slug}/v${version}-${hash8(bytes)}/${variant}.${EXT[mime] || 'bin'}`;
}

export function parseKey(key) {
  const m = String(key).match(/^visuals\/([a-z0-9-]+)\/v(\d+)-([0-9a-f]{8})\/([a-z0-9_-]+)\.(\w+)$/);
  return m ? { slug: m[1], version: +m[2], hash: m[3], variant: m[4], ext: m[5] } : null;
}

export function memoryStorage() {
  const objects = new Map();
  return {
    id: 'memory',
    async put(key, bytes, mime) { objects.set(key, { bytes, mime }); return { key, url: `memory://${key}` }; },
    async list(prefix = 'visuals/') { return [...objects.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key, url: `memory://${key}` })); },
    async remove(keys) { for (const k of keys) objects.delete(k); },
    objects
  };
}

export function localStorage(root = process.env.NUVELLUM_VISUAL_DIR || '.visual-store') {
  const walk = async (dir) => {
    let out = [];
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = join(dir, e.name);
      out = out.concat(e.isDirectory() ? await walk(p) : [p]);
    }
    return out;
  };
  return {
    id: 'local',
    async put(key, bytes) {
      const path = join(root, ...key.split('/'));
      if (!(await stat(path).catch(() => null))) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); }
      return { key, url: `file://${path}` };
    },
    async list(prefix = 'visuals/') {
      return (await walk(root)).map(p => relative(root, p).split(sep).join('/')).filter(k => k.startsWith(prefix)).map(key => ({ key, url: `file://${join(root, key)}` }));
    },
    async remove(keys) { for (const k of keys) await rm(join(root, ...k.split('/')), { force: true }); }
  };
}

// Vercel Blob REST API (same endpoints @vercel/blob uses). Public access, no random suffix,
// because keys are already content-addressed.
export function vercelBlobStorage(token = process.env.BLOB_READ_WRITE_TOKEN, fetchImpl = fetch) {
  const api = 'https://blob.vercel-storage.com';
  const headers = { authorization: `Bearer ${token}`, 'x-api-version': '7' };
  const check = async (res, what) => { if (!res.ok) throw new Error(`vercel-blob ${what} failed: HTTP ${res.status}`); return res.json(); };
  return {
    id: 'vercel-blob',
    async put(key, bytes, mime) {
      const res = await fetchImpl(`${api}/${key}`, { method: 'PUT', headers: { ...headers, 'x-content-type': mime, 'x-add-random-suffix': '0', 'x-allow-overwrite': '0', 'x-cache-control-max-age': '31536000' }, body: bytes });
      if (res.status === 409 || res.status === 400) { const hit = (await this.list(key))[0]; if (hit) return hit; }
      const data = await check(res, 'put');
      return { key, url: data.url };
    },
    async list(prefix = 'visuals/') {
      const out = [];
      let cursor;
      do {
        const q = new URLSearchParams({ prefix, limit: '1000', ...(cursor ? { cursor } : {}) });
        const data = await check(await fetchImpl(`${api}?${q}`, { headers }), 'list');
        for (const b of data.blobs || []) out.push({ key: b.pathname, url: b.url });
        cursor = data.hasMore ? data.cursor : undefined;
      } while (cursor);
      return out;
    },
    async remove(keys) {
      const urls = (await this.list()).filter(b => keys.includes(b.key)).map(b => b.url);
      if (urls.length) await check(await fetchImpl(`${api}/delete`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ urls }) }), 'delete');
    }
  };
}

/** Choose storage from the environment: Blob when configured, else local; `memory` for tests. */
export function selectStorage(env = process.env) {
  const want = env.NUVELLUM_VISUAL_STORAGE;
  if (want === 'memory') return memoryStorage();
  if (want === 'vercel-blob' || (!want && env.BLOB_READ_WRITE_TOKEN)) {
    if (!env.BLOB_READ_WRITE_TOKEN) throw new Error('NUVELLUM_VISUAL_STORAGE=vercel-blob needs BLOB_READ_WRITE_TOKEN');
    return vercelBlobStorage(env.BLOB_READ_WRITE_TOKEN);
  }
  return localStorage(env.NUVELLUM_VISUAL_DIR);
}

/** Keys not referenced by any manifest (dry run unless remove=true). */
export async function findOrphans(storage, referencedKeys, { remove = false } = {}) {
  const ref = new Set(referencedKeys);
  const orphans = (await storage.list()).map(o => o.key).filter(k => !ref.has(k));
  if (remove && orphans.length) await storage.remove(orphans);
  return orphans;
}
