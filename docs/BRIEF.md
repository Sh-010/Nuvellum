# The Nuvellum Brief — sign-ups, delivery and unsubscribe

The Brief is a real, consent-based newsletter product.

Nuvellum keeps the canonical subscription record in its private Upstash Redis database. **Resend is the delivery layer**: when a reader subscribes, the site mirrors that reader into the private **Nuvellum Brief** Resend segment and opts them into the **Nuvellum Brief** topic. When a reader unsubscribes through Nuvellum, the site immediately marks the local record unsubscribed and mirrors that state to Resend.

The public repository never stores subscriber addresses, API keys or mailing-list exports.

## Moving parts

| Part | Where |
| --- | --- |
| Public sign-up/unsubscribe endpoint | `api/brief.js` → `scripts/lib/brief/handler.mjs` |
| Consent rules, tokens, list and CSV | `scripts/lib/brief/brief.mjs` |
| Private subscriber store | `scripts/lib/brief/store.mjs` |
| Resend contact/topic sync | `scripts/lib/brief/resend.mjs` |
| Private subscriber list | `/admin` → **Brief** |
| Sign-up surfaces | front-page Brief section and masthead invitation |
| Reader unsubscribe page | `/brief/unsubscribe?s=…&t=…` |
| Resend sender domain | `nuvellum.news`, EU region |
| Resend segment/topic | **Nuvellum Brief** / **Nuvellum Brief** |
| Resend design master | template alias `nuvellum-brief-daily` |
| Tests | `tests/brief.test.mjs` |

## Production environment

The local consent store still requires the original three settings:

| Variable | Purpose |
| --- | --- |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | private Upstash subscriber store |
| `NUVELLUM_BRIEF_SECRET` | 32+ random characters; keys records and signs unsubscribe links |

Resend delivery sync additionally requires:

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | server-side Resend API key; secret |
| `RESEND_BRIEF_SEGMENT_ID` | ID of the Resend **Nuvellum Brief** segment |
| `RESEND_BRIEF_TOPIC_ID` | ID of the Resend **Nuvellum Brief** topic |

Keep `SITE_URL=https://www.nuvellum.news` in production so signed unsubscribe URLs always use the canonical site.

If the Upstash settings or `NUVELLUM_BRIEF_SECRET` are absent, sign-up remains closed and no address is stored. If the Resend settings are absent, the consent store continues to work but delivery sync is disabled. This separation is intentional: a temporary mail-provider problem must never erase or falsify a reader's consent record.

## Subscription lifecycle

1. The reader enters an address and explicitly ticks the consent checkbox.
2. The server validates and normalises the address, applies bot/rate protections, and commits the consent record to Upstash.
3. The server mirrors the active reader to Resend:
   - global contact: active;
   - segment: **Nuvellum Brief**;
   - topic: **Nuvellum Brief** = opt-in;
   - contact properties:
     - `nuvellum_subscriber_id`
     - `nuvellum_unsubscribe_url`
     - `nuvellum_source`
     - `nuvellum_consent_at`
4. Duplicate sign-ups do not create duplicate local records. They do re-run the Resend upsert, which also repairs a previously missed provider sync.
5. A previously unsubscribed reader may explicitly subscribe again; the same local record is reactivated and Resend is reactivated too.

A Resend outage after the local commit does **not** turn a valid sign-up into an error for the reader. It is logged generically, without the address, provider response or credentials. A later duplicate/resubscribe repairs the provider state. The admin CSV remains a recovery path if a wider reconciliation is ever needed.

## Unsubscribe

Nuvellum's own signed unsubscribe URL remains the canonical reader exit. It contains an opaque subscriber key and HMAC token, never the address.

- Nothing happens merely by loading the page; the reader confirms with a button so mail scanners cannot unsubscribe them accidentally.
- The local Upstash record is marked unsubscribed first.
- Resend is then marked globally unsubscribed and the Nuvellum Brief topic is opted out.
- Repeating the action is harmless.
- Manual unsubscribe from the private **Brief** admin tab also mirrors to Resend.

For production **Broadcasts**, use the contact property `{{{nuvellum_unsubscribe_url}}}` for the visible unsubscribe link. That keeps Nuvellum's audit record and Resend's delivery state in the same flow. Do not replace that link with a raw email address or unsigned query string.

The published Resend template `nuvellum-brief-daily` is a reusable design master. If it is used for per-recipient/template sending, supply the reader's Nuvellum signed unsubscribe URL explicitly rather than inventing one.

## Resend configuration

The sender domain `nuvellum.news` is verified. Sending is enabled; receiving is intentionally disabled. Open and click tracking are disabled.

DNS records for Resend live alongside Google Workspace and must not replace Google's MX/SPF/DKIM records.

The Resend contact topic is private and defaults to opt-out. A website sign-up is the event that explicitly opts a contact into the topic.

## Consent and abuse rules

- Addresses are trimmed, lower-cased and IDNA-normalised.
- Consent must be literal boolean `true`; consent time and wording version are stored.
- A hidden honeypot and 2.5-second minimum fill time reject obvious bots.
- Rate limits are 5 attempts per client per 10 minutes and 300 total per hour.
- The client rate key is a short-lived keyed fingerprint; the IP itself is not stored.
- Sign-up requests are same-origin JSON only.
- Public responses do not reveal whether an address was already subscribed.

## Admin and recovery

The private **Brief** tab can list/search subscribers, filter status, manually unsubscribe and export active records to CSV. The CSV includes the signed Nuvellum unsubscribe URL and remains useful for disaster recovery or a one-off provider reconciliation.

Do not make Resend the sole consent database. Upstash is deliberately retained as Nuvellum's independent consent/audit record.

## Full erasure

Unsubscribing keeps a minimal consent-history record so the reader is not accidentally re-imported and a later re-subscribe is explicit. A full erasure request requires deleting the subscriber record/index entry from Upstash and removing or anonymising the corresponding Resend contact according to the erasure request.
