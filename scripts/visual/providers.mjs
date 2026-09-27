// Image-provider layer. Mirrors the text-model provider chains (NUVELLUM_ROLE_<ROLE>):
//
//   NUVELLUM_ROLE_IMAGE="google:gemini-2.5-flash-image,openai:gpt-image-1,svg:gemini-3.5-flash-lite"
//   NUVELLUM_ROLE_IMAGE_QA="google:gemini-3.5-flash-lite"
//
// Providers are tried in order. Each failure is classified (auth, quota, rate_limit, timeout,
// outage, malformed, safety) so the engine can decide whether to retry, skip or fall back.
// Keys come only from the environment and are never logged, returned or embedded in errors.
import { sanitizeSvg } from './svg.mjs';

export class ImageProviderError extends Error {
  constructor(provider, kind, message, { retryAfterMs } = {}) {
    super(`${provider}: ${kind}: ${String(message || '').slice(0, 200)}`);
    this.provider = provider;
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

function classify(provider, status, body, text) {
  const msg = body?.error?.message || body?.message || String(text || '').slice(0, 160);
  const retry = (() => {
    const d = (body?.error?.details || []).find(x => /RetryInfo/.test(x['@type'] || ''));
    const s = d && parseFloat(String(d.retryDelay || '').replace('s', ''));
    return Number.isFinite(s) ? Math.round(s * 1000) : undefined;
  })();
  if (status === 401 || status === 403) return new ImageProviderError(provider, 'auth', msg);
  if (status === 429) {
    // "limit: 0" means the plan has no quota for this model at all: retrying cannot help.
    const hardQuota = /limit:\s*0\b|quota/i.test(msg) && /limit:\s*0\b/.test(msg);
    return new ImageProviderError(provider, hardQuota ? 'quota' : 'rate_limit', msg, { retryAfterMs: retry });
  }
  if (status === 400 && /safety|blocked|policy/i.test(msg)) return new ImageProviderError(provider, 'safety', msg);
  if (status >= 500) return new ImageProviderError(provider, 'outage', msg);
  return new ImageProviderError(provider, 'malformed', `HTTP ${status}: ${msg}`);
}

async function request(provider, url, { headers, body, timeoutMs, fetchImpl }) {
  let res;
  try {
    res = await (fetchImpl || fetch)(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new ImageProviderError(provider, err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : 'outage', err?.message || 'network error');
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw classify(provider, res.status, data, text);
  if (!data) throw new ImageProviderError(provider, 'malformed', 'non-JSON response');
  return data;
}

// Google Gemini native image models (generateContent with IMAGE modality). Env: GEMINI_API_KEY.
export const google = {
  id: 'google',
  isConfigured: (env) => Boolean(env.GEMINI_API_KEY),
  defaultModel: 'gemini-2.5-flash-image',
  async generate({ prompt, model, timeoutMs = 60000, fetchImpl }, env) {
    const m = model || this.defaultModel;
    const data = await request('google', `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
      body: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } } },
      timeoutMs, fetchImpl
    });
    if (data?.promptFeedback?.blockReason) throw new ImageProviderError('google', 'safety', data.promptFeedback.blockReason);
    const cand = data?.candidates?.[0];
    if (cand && /SAFETY|PROHIBITED|IMAGE_SAFETY/.test(cand.finishReason || '')) throw new ImageProviderError('google', 'safety', cand.finishReason);
    const part = (cand?.content?.parts || []).find(p => p.inlineData?.data);
    if (!part) throw new ImageProviderError('google', 'malformed', 'no image in response');
    return { bytes: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType || 'image/png', model: m };
  }
};

// OpenAI Images API. Env: OPENAI_API_KEY. Available by configuration only (no spend without a key).
export const openai = {
  id: 'openai',
  isConfigured: (env) => Boolean(env.OPENAI_API_KEY),
  defaultModel: 'gpt-image-1',
  async generate({ prompt, model, timeoutMs = 90000, fetchImpl }, env) {
    const m = model || this.defaultModel;
    const data = await request('openai', 'https://api.openai.com/v1/images/generations', {
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: { model: m, prompt, size: '1536x1024', n: 1 },
      timeoutMs, fetchImpl
    });
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new ImageProviderError('openai', 'malformed', 'no image in response');
    return { bytes: Buffer.from(b64, 'base64'), mime: 'image/png', model: m };
  }
};

// AI editorial SVG via a text model (works on the Gemini free tier). Output is sanitized with the
// same allowlist the repository validator enforces; unsafe output is a 'safety' failure.
export const svg = {
  id: 'svg',
  isConfigured: (env) => Boolean(env.GEMINI_API_KEY),
  defaultModel: 'gemini-3.5-flash-lite',
  async generate({ prompt, model, timeoutMs = 60000, fetchImpl }, env) {
    const m = model || this.defaultModel;
    const data = await request('svg', `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
      body: { contents: [{ parts: [{ text: `${prompt}\n\nReturn ONLY one complete SVG document (viewBox 0 0 1200 675) using shapes, paths and gradients. No <text>, <image>, <script>, <foreignObject>, links or external references.` }] }] },
      timeoutMs, fetchImpl
    });
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    const clean = sanitizeSvg(text);
    if (!clean.ok) throw new ImageProviderError('svg', clean.reason === 'unsafe' ? 'safety' : 'malformed', clean.detail);
    return { bytes: Buffer.from(clean.svg, 'utf8'), mime: 'image/svg+xml', model: m };
  }
};

// Deterministic test double. MOCK_IMAGE_BEHAVIOUR: ok | quota | rate_limit | timeout | safety | malformed | slow
export const mock = {
  id: 'mock',
  isConfigured: () => true,
  defaultModel: 'mock-1',
  async generate({ model, timeoutMs = 1000 }, env) {
    const b = env.MOCK_IMAGE_BEHAVIOUR || 'ok';
    if (b === 'slow') await new Promise(r => setTimeout(r, timeoutMs + 50));
    if (b === 'slow' || b === 'timeout') throw new ImageProviderError('mock', 'timeout', 'mock timeout');
    if (b !== 'ok') throw new ImageProviderError('mock', b, `mock ${b}`, { retryAfterMs: b === 'rate_limit' ? 10 : undefined });
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
    return { bytes: png, mime: 'image/png', model: model || 'mock-1' };
  }
};

export const IMAGE_PROVIDERS = { google, openai, svg, mock };

export function imageChain(role = 'image', env = process.env) {
  const raw = env[`NUVELLUM_ROLE_${role.toUpperCase()}`] || 'google:gemini-2.5-flash-image';
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(entry => {
    const [provider, ...rest] = entry.split(':');
    return { provider, model: rest.join(':') || undefined };
  }).filter(({ provider }) => IMAGE_PROVIDERS[provider]);
}

/**
 * Try each configured provider for up to `candidates` images. Never throws: returns the images
 * obtained plus a structured attempt log. Retries only transient rate limits, once, when the
 * provider says the wait is short; quota/auth/safety/malformed skip straight to the next provider.
 */
export async function generateCandidates({ prompt, candidates = 2, env = process.env, deadline = Date.now() + 120000, fetchImpl, role = 'image' }) {
  const images = [];
  const attempts = [];
  for (const { provider, model } of imageChain(role, env)) {
    const p = IMAGE_PROVIDERS[provider];
    if (!p.isConfigured(env)) { attempts.push({ provider, model, outcome: 'not_configured' }); continue; }
    let retried = false;
    while (images.length < candidates) {
      const remaining = deadline - Date.now();
      if (remaining < 2000) { attempts.push({ provider, model, outcome: 'deadline' }); return { images, attempts }; }
      try {
        const img = await p.generate({ prompt, model, timeoutMs: Math.min(remaining, 90000), fetchImpl }, env);
        images.push({ ...img, provider });
        attempts.push({ provider, model: img.model, outcome: 'ok', bytes: img.bytes.length });
      } catch (err) {
        const kind = err instanceof ImageProviderError ? err.kind : 'outage';
        attempts.push({ provider, model, outcome: kind, detail: String(err.message || '').slice(0, 200) });
        if (kind === 'rate_limit' && !retried && (err.retryAfterMs ?? 5000) <= 30000 && deadline - Date.now() > (err.retryAfterMs ?? 5000) + 5000) {
          retried = true;
          await new Promise(r => setTimeout(r, err.retryAfterMs ?? 5000));
          continue;
        }
        break; // next provider
      }
    }
    if (images.length >= candidates) break;
  }
  return { images, attempts };
}
