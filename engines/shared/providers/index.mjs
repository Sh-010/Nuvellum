// Multi-model provider layer.
//
// Each editorial job ("role") is assigned an ordered chain of providers via
// environment variables, so models can be swapped without code changes and a
// missing or failing provider degrades gracefully to the next one, and
// finally to the caller's deterministic fallback.
//
//   NUVELLUM_ROLE_SOCIAL="gemini:gemini-2.5-flash,anthropic:claude-sonnet-5"
//   NUVELLUM_ROLE_SHORTS_VERIFY="anthropic:claude-sonnet-5,openai:gpt-5-mini"
//
// Keys come only from the environment (names in .env.example); nothing here
// logs or returns them.
import { gemini } from './gemini.mjs';
import { anthropic } from './anthropic.mjs';
import { openai } from './openai.mjs';
import { mock } from './mock.mjs';

export const PROVIDERS = { gemini, anthropic, openai, mock };
export const ROLES = ['draft', 'review', 'verify', 'social', 'shorts_script', 'shorts_verify'];

export class ProviderUnavailableError extends Error {
  constructor(role, attempts) {
    super(`no provider available for role "${role}"${attempts.length ? `: ${attempts.map(a => `${a.provider}(${a.error})`).join('; ')}` : ' (none configured)'}`);
    this.role = role;
    this.attempts = attempts;
  }
}

export function chainFor(role, env = process.env) {
  const raw = env[`NUVELLUM_ROLE_${role.toUpperCase()}`] || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(entry => {
    const [provider, ...rest] = entry.split(':');
    return { provider, model: rest.join(':') || undefined };
  }).filter(({ provider }) => PROVIDERS[provider]);
}

/** Providers in the chain that are configured (have keys) in this environment. */
export function availableChain(role, env = process.env) {
  return chainFor(role, env).filter(({ provider }) => PROVIDERS[provider].isConfigured(env));
}

/**
 * Run a completion for a role, trying each configured provider in order.
 * @returns {Promise<{ text: string, provider: string, model: string }>}
 */
export async function complete(role, { system, prompt, json = false, maxTokens = 1500, timeoutMs = 45000 }, env = process.env) {
  const attempts = [];
  for (const { provider, model } of availableChain(role, env)) {
    try {
      const text = await PROVIDERS[provider].complete({ system, prompt, json, maxTokens, model, timeoutMs }, env);
      if (!String(text || '').trim()) throw new Error('empty response');
      return { text, provider, model: model || PROVIDERS[provider].defaultModel(env) };
    } catch (err) {
      attempts.push({ provider, error: String(err.message || err).slice(0, 160) });
    }
  }
  throw new ProviderUnavailableError(role, attempts);
}

/** True when two roles would be served by the same first provider (weak independence). */
export function sameFirstProvider(roleA, roleB, env = process.env) {
  const a = availableChain(roleA, env)[0];
  const b = availableChain(roleB, env)[0];
  return Boolean(a && b && a.provider === b.provider && (a.model || '') === (b.model || ''));
}
