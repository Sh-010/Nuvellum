import { readFileSync, statSync } from 'node:fs';
import { call, form, AdapterError } from './common.mjs';
// YouTube Data API v3 resumable upload (Shorts = vertical video <= 3 min with #Shorts).
// OAuth refresh-token flow. Env: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
// (optional YOUTUBE_PRIVACY: private|unlisted|public, default private; GOOGLE_OAUTH_BASE_URL, YOUTUBE_UPLOAD_BASE_URL).
export default {
  id: 'youtube', needs: 'video', env: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'],
  isConfigured: (env) => Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_REFRESH_TOKEN),
  async publish(post, env) {
    const { data: tok } = await call(`${env.GOOGLE_OAUTH_BASE_URL || 'https://oauth2.googleapis.com'}/token`, {
      method: 'POST',
      body: form({ client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, refresh_token: env.YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' })
    });
    if (!tok?.access_token) throw new AdapterError('no access token from Google OAuth');
    const size = statSync(post.videoPath).size;
    const up = env.YOUTUBE_UPLOAD_BASE_URL || 'https://www.googleapis.com';
    const init = await call(`${up}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(size) },
      body: JSON.stringify({ snippet: { title: post.title, description: post.description, categoryId: '25' }, status: { privacyStatus: env.YOUTUBE_PRIVACY || 'private', selfDeclaredMadeForKids: false } })
    });
    const location = init.headers.get('location');
    if (!location) throw new AdapterError('YouTube did not return an upload URL', { retryable: true });
    const { data } = await call(location, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: readFileSync(post.videoPath) }, 300000);
    return { remoteId: data?.id, url: data?.id ? `https://youtube.com/shorts/${data.id}` : undefined };
  }
};
