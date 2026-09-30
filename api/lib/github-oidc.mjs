import { createPublicKey, verify as verifySignature } from 'node:crypto';

const ISSUER = 'https://token.actions.githubusercontent.com';
let jwksPromise;

const decodeJson = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

async function loadJwks(fetchImpl = fetch) {
  if (!jwksPromise) {
    jwksPromise = (async () => {
      const configRes = await fetchImpl(`${ISSUER}/.well-known/openid-configuration`);
      if (!configRes.ok) throw new Error('GitHub identity configuration unavailable.');
      const config = await configRes.json();
      if (!/^https:\/\/token\.actions\.githubusercontent\.com\//.test(String(config.jwks_uri || ''))) {
        throw new Error('Unexpected GitHub identity key endpoint.');
      }
      const keysRes = await fetchImpl(config.jwks_uri);
      if (!keysRes.ok) throw new Error('GitHub identity keys unavailable.');
      const body = await keysRes.json();
      if (!Array.isArray(body.keys)) throw new Error('GitHub identity keys malformed.');
      return body.keys;
    })().catch((err) => { jwksPromise = null; throw err; });
  }
  return jwksPromise;
}

const hasAudience = (claim, wanted) => Array.isArray(claim) ? claim.includes(wanted) : claim === wanted;

export async function verifyGitHubOidc(token, {
  audience = 'nuvellum-brief-send',
  repository = 'Sh-010/Nuvellum',
  workflow = '.github/workflows/brief-send.yml',
  ref = 'refs/heads/main',
  now = () => Math.floor(Date.now() / 1000),
  fetchImpl = fetch
} = {}) {
  if (typeof token !== 'string' || token.length > 12000) throw new Error('Missing GitHub identity token.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed GitHub identity token.');

  let header, claims;
  try { header = decodeJson(parts[0]); claims = decodeJson(parts[1]); }
  catch { throw new Error('Malformed GitHub identity token.'); }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Unsupported GitHub identity token.');
  const keys = await loadJwks(fetchImpl);
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new Error('Unknown GitHub identity key.');

  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2], 'base64url');
  if (!verifySignature('RSA-SHA256', signed, key, signature)) throw new Error('Invalid GitHub identity signature.');

  const t = now();
  if (claims.iss !== ISSUER || !hasAudience(claims.aud, audience)) throw new Error('GitHub identity issuer or audience mismatch.');
  if (!Number.isFinite(claims.exp) || claims.exp < t - 30) throw new Error('GitHub identity token expired.');
  if (claims.nbf != null && Number(claims.nbf) > t + 30) throw new Error('GitHub identity token not active.');
  if (!Number.isFinite(claims.iat) || claims.iat > t + 60 || claims.iat < t - 900) throw new Error('GitHub identity token is stale.');
  if (claims.repository !== repository || claims.ref !== ref) throw new Error('GitHub identity repository mismatch.');
  if (claims.workflow_ref !== `${repository}/${workflow}@${ref}`) throw new Error('GitHub identity workflow mismatch.');
  if (!['schedule', 'push', 'workflow_dispatch'].includes(claims.event_name)) throw new Error('GitHub identity event not allowed.');

  return claims;
}

export async function authenticateGitHubRequest(request, options = {}) {
  const auth = String(request.headers.get('authorization') || '');
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) throw new Error('Authorization required.');
  return verifyGitHubOidc(match[1], options);
}
