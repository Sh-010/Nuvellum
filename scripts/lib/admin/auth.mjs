// Single-owner authentication for the Nuvellum admin. Stateless signed session cookies (HMAC-SHA256),
// server-side password check, CSRF tokens bound to the session, and login throttling.
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = '__Host-nuvellum_admin';
export const SESSION_TTL_MS = 8 * 3600e3;
export const MIN_PASSWORD_LENGTH = 16;
export const MIN_SECRET_LENGTH = 32;

/** Admin is only enabled when both secrets are present and strong; otherwise every endpoint fails closed. */
export function authConfig(env) {
  const password = String(env.NUVELLUM_ADMIN_PASSWORD || '');
  const secret = String(env.NUVELLUM_ADMIN_SESSION_SECRET || '');
  const problems = [];
  if (password.length < MIN_PASSWORD_LENGTH) problems.push(`NUVELLUM_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  if (secret.length < MIN_SECRET_LENGTH) problems.push(`NUVELLUM_ADMIN_SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  if (password && secret && password === secret) problems.push('the password and session secret must differ');
  return { ok: problems.length === 0, problems, password, secret };
}

const digest = (s) => createHash('sha256').update(String(s), 'utf8').digest();

/** Constant-time password comparison (hashing first equalises lengths). */
export function passwordMatches(candidate, password) {
  if (typeof candidate !== 'string' || !candidate || candidate.length > 1024) return false;
  return timingSafeEqual(digest(candidate), digest(password));
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (secret, payload) => b64u(createHmac('sha256', secret).update(payload).digest());

/** Session token: v1.<expiresAtMs>.<nonce>.<hmac>. The nonce also derives the CSRF token. */
export function createSession(secret, now = Date.now()) {
  const expires = now + SESSION_TTL_MS;
  const nonce = b64u(randomBytes(18));
  const payload = `v1.${expires}.${nonce}`;
  return { token: `${payload}.${sign(secret, payload)}`, expires, nonce };
}

export function verifySession(token, secret, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const [v, exp, nonce, mac] = parts;
  const expected = sign(secret, `${v}.${exp}.${nonce}`);
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires <= now || expires > now + SESSION_TTL_MS + 60e3) return null;
  if (!/^[A-Za-z0-9_-]{24}$/.test(nonce)) return null;
  return { expires, nonce };
}

export function csrfToken(secret, nonce) {
  return sign(secret, `csrf.${nonce}`);
}

export function csrfMatches(header, secret, nonce) {
  const expected = Buffer.from(csrfToken(secret, nonce));
  const got = Buffer.from(String(header || ''));
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function sessionCookie(token, expires, now = Date.now()) {
  const maxAge = Math.max(0, Math.floor((expires - now) / 1000));
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function readCookie(header, name = SESSION_COOKIE) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

/**
 * Login throttle. Serverless instances do not share memory, so this is per instance: each failed attempt
 * is also delayed (slowing scripted guessing on any instance), and a long random password is required.
 */
export function createThrottle({ maxFailures = 5, windowMs = 15 * 60e3, globalMax = 30 } = {}) {
  const byKey = new Map();
  let global = [];
  const prune = (list, now) => list.filter(t => now - t < windowMs);
  return {
    blocked(key, now = Date.now()) {
      const list = prune(byKey.get(key) || [], now);
      byKey.set(key, list);
      global = prune(global, now);
      return list.length >= maxFailures || global.length >= globalMax;
    },
    fail(key, now = Date.now()) {
      const list = prune(byKey.get(key) || [], now);
      list.push(now);
      byKey.set(key, list);
      global = prune(global, now);
      global.push(now);
      return list.length;
    },
    reset(key) { byKey.delete(key); },
    delayFor(failures) { return Math.min(5000, 800 + failures * 600); }
  };
}

/** Client key for throttling: the first X-Forwarded-For hop Vercel sets, falling back to X-Real-IP. */
export function clientKey(headers) {
  const xff = String(headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return (xff || String(headers.get('x-real-ip') || '').trim() || 'unknown').slice(0, 64);
}
