import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complete, chainFor, availableChain, ProviderUnavailableError, sameFirstProvider } from '../shared/providers/index.mjs';
import { server } from './helpers.mjs';

test('role chains parse from env and skip unknown/unconfigured providers', () => {
  const env = { NUVELLUM_ROLE_SOCIAL: 'gemini:gemini-x, bogus:y, anthropic:claude-z, openai', GEMINI_API_KEY: 'k' };
  assert.deepEqual(chainFor('social', env).map(c => c.provider), ['gemini', 'anthropic', 'openai']);
  assert.deepEqual(availableChain('social', env).map(c => c.provider), ['gemini']);
});

test('no configured provider -> ProviderUnavailableError (callers use deterministic fallback)', async () => {
  await assert.rejects(complete('social', { prompt: 'x' }, {}), ProviderUnavailableError);
});

test('gemini, anthropic and openai request shapes; keys only in headers', async () => {
  const s = await server((req) => {
    if (req.url.includes('generateContent')) return { json: { candidates: [{ content: { parts: [{ text: 'from-gemini' }] } }] } };
    if (req.url.endsWith('/v1/messages')) return { json: { content: [{ type: 'text', text: 'from-claude' }] } };
    if (req.url.endsWith('/v1/chat/completions')) return { json: { choices: [{ message: { content: 'from-openai' } }] } };
    return { status: 404 };
  });
  try {
    const base = { GEMINI_BASE_URL: s.url, ANTHROPIC_BASE_URL: s.url, OPENAI_BASE_URL: s.url, GEMINI_API_KEY: 'g-key', ANTHROPIC_API_KEY: 'a-key', OPENAI_API_KEY: 'o-key' };
    assert.equal((await complete('draft', { system: 'S', prompt: 'P', json: true }, { ...base, NUVELLUM_ROLE_DRAFT: 'gemini:gemini-test' })).text, 'from-gemini');
    assert.equal((await complete('review', { system: 'S', prompt: 'P' }, { ...base, NUVELLUM_ROLE_REVIEW: 'anthropic:claude-test' })).text, 'from-claude');
    assert.equal((await complete('verify', { system: 'S', prompt: 'P', json: true }, { ...base, NUVELLUM_ROLE_VERIFY: 'openai:gpt-test' })).text, 'from-openai');
    const [g, a, o] = s.calls;
    assert.match(g.url, /models\/gemini-test:generateContent$/);
    assert.equal(g.headers['x-goog-api-key'], 'g-key');
    assert.equal(g.body.generationConfig.responseMimeType, 'application/json');
    assert.ok(!g.url.includes('g-key'), 'key must not be in URL');
    assert.equal(a.headers['x-api-key'], 'a-key');
    assert.equal(a.headers['anthropic-version'], '2023-06-01');
    assert.equal(a.body.model, 'claude-test');
    assert.equal(o.headers.authorization, 'Bearer o-key');
    assert.deepEqual(o.body.response_format, { type: 'json_object' });
  } finally { await s.close(); }
});

test('falls back to the next provider on 429/5xx/empty and reports attempts without keys', async () => {
  const s = await server((req) => {
    if (req.url.includes('generateContent')) return { status: 429, json: { error: { message: 'quota' } } };
    if (req.url.endsWith('/v1/messages')) return { json: { content: [] } };
    return { json: { choices: [{ message: { content: 'openai saved the day' } }] } };
  });
  try {
    const env = { GEMINI_BASE_URL: s.url, ANTHROPIC_BASE_URL: s.url, OPENAI_BASE_URL: s.url, GEMINI_API_KEY: 'secret-g', ANTHROPIC_API_KEY: 'secret-a', OPENAI_API_KEY: 'secret-o', NUVELLUM_ROLE_SOCIAL: 'gemini,anthropic,openai' };
    const r = await complete('social', { prompt: 'P' }, env);
    assert.equal(r.provider, 'openai');
    const envAllFail = { ...env, NUVELLUM_ROLE_SOCIAL: 'gemini,anthropic' };
    const err = await complete('social', { prompt: 'P' }, envAllFail).catch(e => e);
    assert.ok(err instanceof ProviderUnavailableError);
    assert.match(err.message, /429/);
    assert.doesNotMatch(err.message, /secret-/);
  } finally { await s.close(); }
});

test('network failure / timeout degrades to the next provider', async () => {
  const env = { GEMINI_BASE_URL: 'http://127.0.0.1:9', GEMINI_API_KEY: 'k', NUVELLUM_MOCK_RESPONSE: 'mock-ok', NUVELLUM_ROLE_SHORTS_SCRIPT: 'gemini,mock' };
  const r = await complete('shorts_script', { prompt: 'P', timeoutMs: 2000 }, env);
  assert.equal(r.provider, 'mock');
});

test('independence check flags the same model drafting and verifying', () => {
  const env = { GEMINI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k', NUVELLUM_ROLE_DRAFT: 'gemini:a', NUVELLUM_ROLE_VERIFY: 'gemini:a' };
  assert.equal(sameFirstProvider('draft', 'verify', env), true);
  assert.equal(sameFirstProvider('draft', 'verify', { ...env, NUVELLUM_ROLE_VERIFY: 'anthropic' }), false);
});
