import { call, form } from './common.mjs';
// Facebook Page link post via Graph API. Env: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN
// (optional META_GRAPH_VERSION, META_GRAPH_BASE_URL). Token goes in the POST body, never the URL.
export default {
  id: 'facebook', needs: 'link', env: ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'],
  isConfigured: (env) => Boolean(env.FACEBOOK_PAGE_ID && env.FACEBOOK_PAGE_ACCESS_TOKEN),
  async publish(post, env) {
    const base = env.META_GRAPH_BASE_URL || 'https://graph.facebook.com';
    const v = env.META_GRAPH_VERSION || 'v21.0';
    const { data } = await call(`${base}/${v}/${encodeURIComponent(env.FACEBOOK_PAGE_ID)}/feed`, {
      method: 'POST', body: form({ message: post.message, link: post.link, access_token: env.FACEBOOK_PAGE_ACCESS_TOKEN })
    });
    return { remoteId: data?.id };
  }
};
