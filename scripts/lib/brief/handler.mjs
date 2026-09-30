// Public HTTP endpoint of the Nuvellum Brief (api/brief.js): POST ?action=subscribe and POST ?action=unsubscribe.
// Nothing here lists or reveals subscribers; the private list is served only by the authenticated /api/admin.
// Until the subscriber store and NUVELLUM_BRIEF_SECRET are configured, every request answers 503 "not open yet"
// and nothing is stored.
import { redisConfig, createUpstash, StoreError } from './store.mjs';
import { createBrief, BriefError, MIN_SECRET_LENGTH, unsubscribeLink } from './brief.mjs';
import { resendFromEnv } from './resend.mjs';

const MAX_BODY = 4096;

function respond(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', ...headers }
  });
}

/** Brief service from the environment, or null when it is not configured yet. */
export function briefFromEnv(env, { storeFactory = (cfg) => createUpstash(cfg), now } = {}) {
  const cfg = redisConfig(env);
  const secret = String(env.NUVELLUM_BRIEF_SECRET || '');
  if (!cfg.ok || secret.length < MIN_SECRET_LENGTH) return null;
  return createBrief({ store: storeFactory(cfg), secret, now, site: env.SITE_URL || 'https://www.nuvellum.news' });
}

const clientIp = (h) => (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || '').trim();

export function createBriefHandler({ env = process.env, storeFactory, resendFactory, now = () => Date.now(), log = console } = {}) {
  return async function handle(request) {
    try {
      const url = new URL(request.url), action = url.searchParams.get('action') || '';
      if (request.method !== 'POST' || !['subscribe', 'unsubscribe'].includes(action)) return respond(404, { error: 'Not found.' });
      const brief = briefFromEnv(env, { storeFactory, now });
      if (!brief) return respond(503, { error: 'The Nuvellum Brief is not open for sign-ups yet. Your address was not stored.', code: 'not-open' });
      const resend = resendFromEnv(env, { resendFactory });

      const origin = request.headers.get('origin');
      const sameOrigin = origin === `${url.protocol}//${url.host}`;
      const type = String(request.headers.get('content-type') || '').toLowerCase();
      const text = (await request.text()).slice(0, MAX_BODY + 1);
      if (text.length > MAX_BODY) return respond(413, { error: 'Request too large.' });

      if (action === 'subscribe') {
        // Sign-ups come only from Nuvellum's own pages.
        if (!sameOrigin) return respond(403, { error: 'Cross-site request refused.' });
        if (!type.startsWith('application/json')) return respond(415, { error: 'Expected JSON.' });
        let body; try { body = JSON.parse(text || '{}'); } catch { return respond(400, { error: 'Malformed request.' }); }
        const r = await brief.subscribe({ email: body.email, consent: body.consent === true, source: body.source, honeypot: body.website, elapsedMs: body.elapsedMs, ip: clientIp(request.headers) });
        log.info?.(`[brief] subscribe: ${r.outcome}`);
        if (resend) {
          try {
            const site = env.SITE_URL || 'https://www.nuvellum.news';
            await resend.subscribe({ email: r.email, id: r.id, source: r.source, consentAt: r.consentAt, unsubscribeUrl: unsubscribeLink(site, String(env.NUVELLUM_BRIEF_SECRET || ''), r.id) });
          } catch { log.error?.('[brief] Resend sync failed after subscribe'); }
        }
        return respond(200, { ok: true, message: 'Thank you. You are on the list for the Nuvellum Brief.' });
      }

      // Unsubscribe: from the confirmation page (JSON, same origin) or an email client's one-click request
      // (RFC 8058: form-encoded "List-Unsubscribe=One-Click" with the signed link parameters in the URL).
      let id = url.searchParams.get('s'), token = url.searchParams.get('t');
      if (type.startsWith('application/json')) {
        if (!sameOrigin) return respond(403, { error: 'Cross-site request refused.' });
        try { const b = JSON.parse(text || '{}'); id = b.s ?? id; token = b.t ?? token; } catch { return respond(400, { error: 'Malformed request.' }); }
      } else if (!/List-Unsubscribe=One-Click/i.test(text)) return respond(400, { error: 'Malformed request.' });
      const r = await brief.unsubscribe({ id, token });
      log.info?.(`[brief] unsubscribe: ${r.outcome}`);
      if (resend && r.email) {
        try { await resend.unsubscribe({ email: r.email }); }
        catch { log.error?.('[brief] Resend sync failed after unsubscribe'); }
      }
      return respond(200, { ok: true, message: 'You have been unsubscribed from the Nuvellum Brief. You will not receive it again.' });
    } catch (err) {
      if (err instanceof BriefError) return respond(err.status, { error: err.message, code: err.code });
      if (err instanceof StoreError) { log.error?.('[brief] store unavailable'); return respond(503, { error: 'The Brief is briefly unavailable. Please try again in a few minutes.', code: 'store' }); }
      log.error?.('[brief] unexpected error: ' + (err?.name || 'Error'));
      return respond(500, { error: 'Something went wrong. Your address was not stored.' });
    }
  };
}
