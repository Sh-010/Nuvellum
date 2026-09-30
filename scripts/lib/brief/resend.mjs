// Resend delivery sync for the Nuvellum Brief.
//
// Upstash remains Nuvellum's canonical consent/audit record. Resend is the delivery layer:
// successful site sign-ups are mirrored into the Nuvellum Brief segment/topic and site
// unsubscribes are mirrored back to Resend so a reader cannot be mailed again.
//
// Required Vercel environment variables:
//   RESEND_API_KEY
//   RESEND_BRIEF_SEGMENT_ID
//   RESEND_BRIEF_TOPIC_ID
//
// No API response body or credential is ever surfaced to readers or logs.

const API = 'https://api.resend.com';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ResendSyncError extends Error {}

export function resendConfig(env = {}) {
  const apiKey = String(env.RESEND_API_KEY || '');
  const segmentId = String(env.RESEND_BRIEF_SEGMENT_ID || '');
  const topicId = String(env.RESEND_BRIEF_TOPIC_ID || '');
  return {
    ok: apiKey.startsWith('re_') && apiKey.length >= 20 && UUID_RE.test(segmentId) && UUID_RE.test(topicId),
    apiKey,
    segmentId,
    topicId
  };
}

export function createResendSync({ apiKey, segmentId, topicId, fetchImpl = fetch }) {
  const request = async (method, path, body) => {
    let res;
    try {
      res = await fetchImpl(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new ResendSyncError('Resend could not be reached.');
    }
    // Deliberately do not parse or return the response body: it may contain provider detail
    // that should never reach a public response or log.
    return { ok: res.ok, status: res.status };
  };

  const contactPath = (email) => `/contacts/${encodeURIComponent(email)}`;
  const propertiesFor = ({ id, source, consentAt, unsubscribeUrl }) => ({
    nuvellum_subscriber_id: String(id || ''),
    nuvellum_unsubscribe_url: String(unsubscribeUrl || ''),
    nuvellum_source: String(source || 'website').slice(0, 80),
    nuvellum_consent_at: String(consentAt || '')
  });

  async function ensureSegmentAndTopic(email, subscription) {
    const base = contactPath(email);
    const segment = await request('POST', `${base}/segments/${segmentId}`);
    // Already in the segment is harmless; Resend may answer 409 for an existing membership.
    if (!segment.ok && segment.status !== 409) throw new ResendSyncError('Resend segment sync failed.');
    const topic = await request('PATCH', `${base}/topics`, [{ id: topicId, subscription }]);
    if (!topic.ok) throw new ResendSyncError('Resend topic sync failed.');
  }

  return {
    /** Upsert an active subscriber and place them in the Brief segment/topic. */
    async subscribe({ email, id, source, consentAt, unsubscribeUrl }) {
      const props = propertiesFor({ id, source, consentAt, unsubscribeUrl });
      const path = contactPath(email);

      // Updating first avoids a duplicate-create error for readers already known to Resend.
      const update = await request('PATCH', path, { unsubscribed: false, properties: props });
      if (update.ok) {
        await ensureSegmentAndTopic(email, 'opt_in');
        return;
      }
      if (update.status !== 404) throw new ResendSyncError('Resend contact update failed.');

      const create = await request('POST', '/contacts', {
        email,
        unsubscribed: false,
        properties: props,
        segments: [{ id: segmentId }],
        topics: [{ id: topicId, subscription: 'opt_in' }]
      });
      if (create.ok) return;

      // A concurrent request may have created the contact after our initial PATCH.
      if (create.status === 409) {
        const retry = await request('PATCH', path, { unsubscribed: false, properties: props });
        if (!retry.ok) throw new ResendSyncError('Resend contact retry failed.');
        await ensureSegmentAndTopic(email, 'opt_in');
        return;
      }
      throw new ResendSyncError('Resend contact creation failed.');
    },

    /** Mark the reader unsubscribed globally and from the Brief topic. */
    async unsubscribe({ email }) {
      if (!email) return;
      const path = contactPath(email);
      const contact = await request('PATCH', path, { unsubscribed: true });
      // If a provider sync never created this contact, the local unsubscribe is still complete.
      if (!contact.ok && contact.status !== 404) throw new ResendSyncError('Resend unsubscribe failed.');
      if (contact.status === 404) return;
      const topic = await request('PATCH', `${path}/topics`, [{ id: topicId, subscription: 'opt_out' }]);
      if (!topic.ok && topic.status !== 404) throw new ResendSyncError('Resend topic unsubscribe failed.');
    }
  };
}

/** Configured Resend sync client, or null when delivery sync has not been connected yet. */
export function resendFromEnv(env, { resendFactory = (cfg) => createResendSync(cfg) } = {}) {
  const cfg = resendConfig(env);
  return cfg.ok ? resendFactory(cfg) : null;
}
