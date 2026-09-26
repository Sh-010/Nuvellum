import { postJson } from './http.mjs';
// OpenAI Chat Completions API. Env: OPENAI_API_KEY, optional OPENAI_MODEL, OPENAI_BASE_URL.
export const openai = {
  isConfigured: (env) => Boolean(env.OPENAI_API_KEY),
  defaultModel: (env) => env.OPENAI_MODEL || 'gpt-5-mini',
  async complete({ system, prompt, json, maxTokens, model, timeoutMs }, env) {
    const base = (env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
    const data = await postJson(`${base}/v1/chat/completions`, {
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
      timeoutMs,
      body: {
        model: model || this.defaultModel(env),
        max_completion_tokens: maxTokens,
        messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
        ...(json ? { response_format: { type: 'json_object' } } : {})
      }
    });
    return data?.choices?.[0]?.message?.content || '';
  }
};
