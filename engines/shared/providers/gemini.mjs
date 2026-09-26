import { postJson } from './http.mjs';
// Google Gemini (Generative Language API). Env: GEMINI_API_KEY, optional GEMINI_MODEL, GEMINI_BASE_URL.
export const gemini = {
  isConfigured: (env) => Boolean(env.GEMINI_API_KEY),
  defaultModel: (env) => env.GEMINI_MODEL || 'gemini-2.5-flash',
  async complete({ system, prompt, json, maxTokens, model, timeoutMs }, env) {
    const m = model || this.defaultModel(env);
    const base = (env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const data = await postJson(`${base}/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
      timeoutMs,
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) }
      }
    });
    return (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  }
};
