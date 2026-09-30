import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifyGitHubOidc } from '../api/lib/github-oidc.mjs';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: 'jwk' });
publicJwk.kid = 'test-key';
publicJwk.alg = 'RS256';
publicJwk.use = 'sig';

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function tokenFor(claims) {
  const header = b64({ alg: 'RS256', typ: 'JWT', kid: 'test-key' });
  const payload = b64(claims);
  const input = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(input).end().sign(privateKey).toString('base64url');
  return `${input}.${signature}`;
}

const now = 1_800_000_000;
const claims = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: 'nuvellum-brief-send',
  exp: now + 300,
  iat: now,
  nbf: now - 5,
  repository: 'Sh-010/Nuvellum',
  ref: 'refs/heads/main',
  workflow_ref: 'Sh-010/Nuvellum/.github/workflows/brief-send.yml@refs/heads/main',
  event_name: 'schedule'
};

const fetchImpl = async (url) => {
  if (String(url).endsWith('/.well-known/openid-configuration')) {
    return new Response(JSON.stringify({ jwks_uri: 'https://token.actions.githubusercontent.com/.well-known/jwks' }), { status: 200 });
  }
  if (String(url).endsWith('/.well-known/jwks')) {
    return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });
  }
  return new Response('not found', { status: 404 });
};

test('GitHub OIDC verifier accepts only the intended main-branch Brief workflow', async () => {
  const out = await verifyGitHubOidc(tokenFor(claims), { now: () => now, fetchImpl });
  assert.equal(out.repository, 'Sh-010/Nuvellum');
  assert.equal(out.event_name, 'schedule');

  await assert.rejects(
    verifyGitHubOidc(tokenFor({ ...claims, repository: 'someone/else' }), { now: () => now, fetchImpl }),
    /repository mismatch/
  );
  await assert.rejects(
    verifyGitHubOidc(tokenFor({ ...claims, ref: 'refs/heads/feature' }), { now: () => now, fetchImpl }),
    /repository mismatch/
  );
  await assert.rejects(
    verifyGitHubOidc(tokenFor({ ...claims, event_name: 'pull_request' }), { now: () => now, fetchImpl }),
    /event not allowed/
  );
});

test('GitHub OIDC verifier rejects stale and wrongly-audienced tokens', async () => {
  await assert.rejects(
    verifyGitHubOidc(tokenFor({ ...claims, aud: 'other-service' }), { now: () => now, fetchImpl }),
    /issuer or audience mismatch/
  );
  await assert.rejects(
    verifyGitHubOidc(tokenFor({ ...claims, exp: now - 60 }), { now: () => now, fetchImpl }),
    /expired/
  );
});
