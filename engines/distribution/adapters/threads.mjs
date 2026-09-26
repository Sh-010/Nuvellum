import { call, form } from './common.mjs';
// Threads API: create a TEXT container, then publish it.
// Env: THREADS_USER_ID, THREADS_ACCESS_TOKEN (optional THREADS_BASE_URL).
export default {
  id: 'threads', needs: 'text', env: ['THREADS_USER_ID', 'THREADS_ACCESS_TOKEN'],
  isConfigured: (env) => Boolean(env.THREADS_USER_ID && env.THREADS_ACCESS_TOKEN),
  async publish(post, env) {
    const base = `${env.THREADS_BASE_URL || 'https://graph.threads.net'}/v1.0/${encodeURIComponent(env.THREADS_USER_ID)}`;
    const token = env.THREADS_ACCESS_TOKEN;
    const { data: c } = await call(`${base}/threads`, { method: 'POST', body: form({ media_type: 'TEXT', text: post.text, access_token: token }) });
    const { data } = await call(`${base}/threads_publish`, { method: 'POST', body: form({ creation_id: c?.id, access_token: token }) });
    return { remoteId: data?.id };
  }
};
