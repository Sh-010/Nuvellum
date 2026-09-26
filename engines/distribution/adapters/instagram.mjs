import { call, form } from './common.mjs';
// Instagram Graph API (professional account): image container -> publish.
// Instagram fetches the image itself, so it must be a publicly reachable JPEG
// (post.imageUrl). SVG editorial art is NOT accepted by Instagram.
// Env: INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN (optional META_GRAPH_VERSION, META_GRAPH_BASE_URL).
export default {
  id: 'instagram', needs: 'image', env: ['INSTAGRAM_USER_ID', 'INSTAGRAM_ACCESS_TOKEN'],
  isConfigured: (env) => Boolean(env.INSTAGRAM_USER_ID && env.INSTAGRAM_ACCESS_TOKEN),
  async publish(post, env) {
    const base = `${env.META_GRAPH_BASE_URL || 'https://graph.facebook.com'}/${env.META_GRAPH_VERSION || 'v21.0'}/${encodeURIComponent(env.INSTAGRAM_USER_ID)}`;
    const token = env.INSTAGRAM_ACCESS_TOKEN;
    const { data: c } = await call(`${base}/media`, { method: 'POST', body: form({ image_url: post.imageUrl, caption: post.text, access_token: token }) });
    const { data } = await call(`${base}/media_publish`, { method: 'POST', body: form({ creation_id: c?.id, access_token: token }) });
    return { remoteId: data?.id };
  }
};
