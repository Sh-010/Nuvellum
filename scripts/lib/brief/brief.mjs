// The Nuvellum Brief: subscriptions, unsubscribe and the private subscriber list.
//
// Privacy by design:
//  - A subscriber's key is a keyed hash of the address (HMAC with NUVELLUM_BRIEF_SECRET). Unsubscribe links carry
//    that opaque key plus a separate signed token, never the address, so links cannot be forged or enumerated.
//  - Signing up answers the same way whether the address was new, already subscribed or previously
//    unsubscribed, so the form cannot be used to find out who reads Nuvellum.
//  - Rate limits use a keyed hash of the client IP that expires within the hour; no IP is stored.
//  - Consent is explicit (a checkbox) and recorded with its time and the wording version.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { domainToASCII } from 'node:url';

export const MIN_SECRET_LENGTH = 32;
export const CONSENT_VERSION = 'brief-consent-v1';
export const CONSENT_TEXT = 'Send me the Nuvellum Brief by email. I can unsubscribe at any time.';
export const LIMITS = { perClient: 5, perClientWindowS: 600, global: 300, globalWindowS: 3600, minFillMs: 2500 };
const KEY = { sub: (id) => `brief:sub:${id}`, index: 'brief:index', rate: (k, w) => `brief:rl:${k}:${w}` };

export class BriefError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }

// ---------- addresses ----------

const LOCAL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** Canonical form used for storage and duplicate detection: trimmed, lower-case, domain in ASCII (IDNA). */
export function normalizeEmail(input) {
  const raw = String(input ?? '').trim().normalize('NFC');
  const at = raw.lastIndexOf('@');
  if (at < 1) return '';
  const local = raw.slice(0, at).toLowerCase(), domain = domainToASCII(raw.slice(at + 1).toLowerCase());
  return domain ? `${local}@${domain}` : '';
}

/** Strict, conservative validation of a normalised address (no quoted local parts, no IP literals). */
export function isValidEmail(email) {
  if (typeof email !== 'string' || email.length > 254 || /\s/.test(email)) return false;
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at), domain = email.slice(at + 1);
  if (at < 1 || local.length > 64 || !LOCAL_RE.test(local)) return false;
  const labels = domain.split('.');
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return false;
  return /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels[labels.length - 1]);
}

// ---------- keys and tokens ----------

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const mac = (secret, label, value) => createHmac('sha256', secret).update(`${label}\u0000${value}`).digest();
export const subscriberId = (secret, email) => b64u(mac(secret, 'nuvellum-brief/id', email)).slice(0, 32);
export const unsubscribeToken = (secret, id) => b64u(mac(secret, 'nuvellum-brief/unsubscribe', id));
export function tokenMatches(secret, id, token) {
  if (typeof id !== 'string' || typeof token !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const want = Buffer.from(unsubscribeToken(secret, id)), got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}
export const unsubscribeLink = (site, secret, id) => `${site.replace(/\/+$/, '')}/brief/unsubscribe?s=${id}&t=${unsubscribeToken(secret, id)}`;
const clientHash = (secret, ip) => b64u(mac(secret, 'nuvellum-brief/client', ip || 'unknown')).slice(0, 22);

// ---------- service ----------

export function createBrief({ store, secret, now = () => Date.now(), site = 'https://www.nuvellum.news' }) {
  if (!secret || secret.length < MIN_SECRET_LENGTH) throw new Error('NUVELLUM_BRIEF_SECRET is missing or too short');
  const read = async (id) => { const v = await store.run(['GET', KEY.sub(id)]); try { return v ? JSON.parse(v) : null; } catch { return null; } };
  const write = (id, rec) => ['SET', KEY.sub(id), JSON.stringify(rec)];

  /** Fixed-window counters; returns false once a limit is reached (the counter still expires on its own). */
  async function withinLimits(ip) {
    const t = Math.floor(now() / 1000), c = clientHash(secret, ip);
    const ck = KEY.rate(c, Math.floor(t / LIMITS.perClientWindowS)), gk = KEY.rate('all', Math.floor(t / LIMITS.globalWindowS));
    const [cn, , gn] = await store.pipeline([['INCR', ck], ['EXPIRE', ck, LIMITS.perClientWindowS], ['INCR', gk], ['EXPIRE', gk, LIMITS.globalWindowS]]);
    return Number(cn) <= LIMITS.perClient && Number(gn) <= LIMITS.global;
  }

  return {
    /**
     * Subscribe. Returns { outcome } where outcome is 'subscribed' | 'already' | 'resubscribed' (for tests and
     * logs); the public response is identical for all three.
     */
    async subscribe({ email, consent, source = '', honeypot = '', elapsedMs = null, ip = '' }) {
      if (honeypot) throw new BriefError(400, 'Please try again.', 'bot');
      if (elapsedMs != null && Number(elapsedMs) < LIMITS.minFillMs) throw new BriefError(400, 'Please try again in a moment.', 'too-fast');
      const address = normalizeEmail(email);
      if (!isValidEmail(address)) throw new BriefError(422, 'Please enter a valid email address.', 'invalid-email');
      if (consent !== true) throw new BriefError(422, 'Please tick the box to confirm you want the Brief.', 'no-consent');
      if (!(await withinLimits(ip))) throw new BriefError(429, 'Too many sign-ups from here just now. Please try again later.', 'rate-limited');
      const id = subscriberId(secret, address), at = new Date(now()).toISOString();
      const rec = await read(id);
      if (rec?.status === 'active') return { outcome: 'already', id };
      const next = rec
        ? { ...rec, status: 'active', updatedAt: at, consentAt: at, consentVersion: CONSENT_VERSION, resubscribedAt: at, unsubscribedAt: null }
        : { email: address, status: 'active', createdAt: at, updatedAt: at, consentAt: at, consentVersion: CONSENT_VERSION, source: String(source).slice(0, 80), unsubscribedAt: null };
      await store.pipeline([write(id, next), ['ZADD', KEY.index, String(Date.parse(next.createdAt)), id]]);
      return { outcome: rec ? 'resubscribed' : 'subscribed', id };
    },

    /** Unsubscribe with a signed link. Idempotent: an already-unsubscribed reader gets the same success. */
    async unsubscribe({ id, token, by = 'reader' }) {
      if (!tokenMatches(secret, id, token)) throw new BriefError(403, 'This unsubscribe link is not valid. Use the link in your most recent Brief.', 'bad-token');
      return this._unsubscribe(id, by);
    },
    async _unsubscribe(id, by) {
      const rec = await read(id);
      if (!rec) return { outcome: 'unknown' }; // never reveal whether an address was ever subscribed
      if (rec.status === 'unsubscribed') return { outcome: 'already' };
      const at = new Date(now()).toISOString();
      await store.run(write(id, { ...rec, status: 'unsubscribed', updatedAt: at, unsubscribedAt: at, unsubscribedBy: by }));
      return { outcome: 'unsubscribed' };
    },

    // ---- admin (called only behind the /admin login) ----
    async adminUnsubscribe(id) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(id)) throw new BriefError(400, 'Unknown subscriber.');
      return this._unsubscribe(id, 'editor');
    },
    async all() {
      const ids = await store.run(['ZREVRANGE', KEY.index, '0', '-1']) || [];
      const recs = ids.length ? await store.run(['MGET', ...ids.map(KEY.sub)]) : [];
      return ids.map((id, i) => { try { return recs[i] ? { id, ...JSON.parse(recs[i]) } : null; } catch { return null; } }).filter(Boolean);
    },
    async list({ q = '', status = '', limit = 200 } = {}) {
      const all = await this.all(), needle = String(q).trim().toLowerCase();
      const rows = all.filter((r) => (!status || r.status === status) && (!needle || r.email.includes(needle)));
      return {
        stats: { active: all.filter((r) => r.status === 'active').length, unsubscribed: all.filter((r) => r.status === 'unsubscribed').length, total: all.length },
        rows: rows.slice(0, Math.min(1000, Math.max(1, Number(limit) || 200))).map(({ id, email, status: st, createdAt, updatedAt, source, unsubscribedAt }) => ({ id, email, status: st, createdAt, updatedAt, source, unsubscribedAt })),
        matched: rows.length
      };
    },
    /** CSV of active subscribers (for importing into a mail provider), with their unsubscribe links. */
    async exportCsv({ status = 'active' } = {}) {
      const rows = (await this.all()).filter((r) => !status || r.status === status);
      const cell = (v) => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const head = ['email', 'status', 'subscribed_at', 'consent_at', 'consent_version', 'source', 'unsubscribe_url'];
      return [head.join(','), ...rows.map((r) => [r.email, r.status, r.createdAt, r.consentAt, r.consentVersion, r.source, unsubscribeLink(site, secret, r.id)].map(cell).join(','))].join('\r\n') + '\r\n';
    }
  };
}
