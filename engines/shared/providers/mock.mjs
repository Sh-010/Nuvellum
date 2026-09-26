// Deterministic offline provider for tests and demos.
// NUVELLUM_MOCK_RESPONSE: fixed text to return. NUVELLUM_MOCK_FAIL=1: always fail.
export const mock = {
  isConfigured: (env) => env.NUVELLUM_MOCK_ENABLED === '1' || Boolean(env.NUVELLUM_MOCK_RESPONSE) || env.NUVELLUM_MOCK_FAIL === '1',
  defaultModel: () => 'mock',
  async complete(_req, env) {
    if (env.NUVELLUM_MOCK_FAIL === '1') throw new Error('mock provider failure');
    return env.NUVELLUM_MOCK_RESPONSE || '{}';
  }
};
