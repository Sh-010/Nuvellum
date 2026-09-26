import { readFileSync, statSync } from 'node:fs';
import { call, AdapterError } from './common.mjs';
// TikTok Content Posting API (direct post, FILE_UPLOAD). Unaudited apps may only
// post privately (SELF_ONLY), so that is the default.
// Env: TIKTOK_ACCESS_TOKEN (optional TIKTOK_PRIVACY_LEVEL, TIKTOK_BASE_URL).
export default {
  id: 'tiktok', needs: 'video', env: ['TIKTOK_ACCESS_TOKEN'],
  isConfigured: (env) => Boolean(env.TIKTOK_ACCESS_TOKEN),
  async publish(post, env) {
    const size = statSync(post.videoPath).size;
    const { data } = await call(`${env.TIKTOK_BASE_URL || 'https://open.tiktokapis.com'}/v2/post/publish/video/init/`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}`, 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        post_info: { title: post.text, privacy_level: env.TIKTOK_PRIVACY_LEVEL || 'SELF_ONLY', disable_comment: false },
        source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 }
      })
    });
    const uploadUrl = data?.data?.upload_url;
    if (!uploadUrl) throw new AdapterError('TikTok did not return an upload URL');
    await call(uploadUrl, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-range': `bytes 0-${size - 1}/${size}` }, body: readFileSync(post.videoPath) }, 300000);
    return { remoteId: data?.data?.publish_id };
  }
};
