import { call } from './common.mjs';
// X API v2 "Create Post". Needs an OAuth 2.0 user-context access token with tweet.write.
// Env: X_USER_ACCESS_TOKEN (optional X_API_BASE_URL).
export default {
  id: 'x', needs: 'text', env: ['X_USER_ACCESS_TOKEN'],
  isConfigured: (env) => Boolean(env.X_USER_ACCESS_TOKEN),
  async publish(post, env) {
    const base = env.X_API_BASE_URL || 'https://api.x.com';
    const { data } = await call(`${base}/2/tweets`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.X_USER_ACCESS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: post.text })
    });
    return { remoteId: data?.data?.id, url: data?.data?.id ? `https://x.com/i/web/status/${data.data.id}` : undefined };
  }
};
