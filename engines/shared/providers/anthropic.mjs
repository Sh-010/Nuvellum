import { postJson } from './http.mjs';
// Anthropic Messages API. Env: ANTHROPIC_API_KEY, optional ANTHROPIC_MODEL, ANTHROPIC_BASE_URL.
export const anthropic = {
  isConfigured: (env) => Boolean(env.ANTHROPIC_API_KEY),
  defaultModel: (env) => env.ANTHROPIC_MODEL || 'claude-sonnet-5',
  async complete({ system, prompt, json, maxTokens, model, timeoutMs }, env) {
    const base = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
    const data = await postJson(`${base}/v1/messages`, {
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      timeoutMs,
      body: {
        model: model || this.defaultModel(env),
        max_tokens: maxTokens,
        temperature: 0.3,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: json ? `${prompt}\n\nRespond with JSON only.` : prompt }]
      }
    });
    return (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }
};
