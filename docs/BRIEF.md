# The Nuvellum Brief — sign-ups, unsubscribe and sending

The Brief sign-up on the front page is a real subscription: addresses are validated on the server, stored privately, protected against bots and floods, and every subscriber can leave with one signed link. Nuvellum does **not** send email itself; a campaign provider does (see "Sending the Brief").

## Moving parts

| Part | Where |
| --- | --- |
| Public endpoint (sign up, unsubscribe) | `api/brief.js` → `scripts/lib/brief/handler.mjs` |
| Subscription rules, tokens, list, CSV | `scripts/lib/brief/brief.mjs` |
| Storage client (Upstash Redis REST, no SDK) | `scripts/lib/brief/store.mjs` |
| Private subscriber list | `/admin` → **Brief** tab (`brief`, `brief-export`, `brief-unsubscribe` in `scripts/lib/admin/handler.mjs`) |
| Sign-up form | front page, `#newsletter` (`scripts/render-editorial-home.mjs`) |
| Unsubscribe page | `/brief/unsubscribe?s=…&t=…` (`src/pages/brief/unsubscribe.astro`; noindex, not in the sitemap) |
| Tests | `tests/brief.test.mjs` |

## Turning it on

Until all three settings exist in the Vercel project, the form answers "The Nuvellum Brief is not open for sign-ups yet. Your address was not stored." and nothing is stored. The admin Brief tab says the store is not connected.

| Environment variable | Comes from | Put it in |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel → Storage / Marketplace → **Upstash for Redis** (free plan), connected to the Nuvellum project. Vercel adds both automatically. (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work.) | Vercel project → Settings → Environment Variables (Production, and Preview if wanted) |
| `NUVELLUM_BRIEF_SECRET` | Generate locally: 32+ random characters, e.g. `node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"` | Same place. Never commit it. **Keep it stable**: it keys every record and signs every unsubscribe link; changing it orphans the list and breaks old links. |

Redeploy after adding them. Upstash's free plan (256 MB, 500,000 commands a month at the time of writing; check upstash.com/pricing/redis) is far beyond what the Brief needs. A sign-up costs about seven commands.

## Rules the endpoint enforces

- **Validation.** The address is trimmed, lower-cased and the domain converted to ASCII (IDNA), then checked conservatively (no quoted local parts, no IP literals, real-looking TLD).
- **Explicit consent.** The checkbox must be ticked (`consent === true`). The consent time and wording version (`brief-consent-v1`) are stored with the record.
- **Duplicates.** One record per normalised address. Signing up again is harmless, and a previously unsubscribed reader is reactivated. The response is identical in every case, so the form cannot be used to discover who subscribes.
- **Bots.** A hidden `website` honeypot field, and a minimum of 2.5 s between the page opening and submission.
- **Rate limits.** 5 sign-ups per client per 10 minutes and 300 in total per hour. The client key is an HMAC of the IP that expires with the window; no IP address is stored.
- **Same-origin only.** Sign-ups must be JSON from `https://www.nuvellum.news` itself (Origin checked).
- **Unsubscribe.** Links carry an opaque key (`s`, a keyed hash, not the address) and a signature (`t`). Forged, altered or cross-subscriber tokens are refused. Repeating an unsubscribe is harmless.
  - The page never acts on load, because mail scanners follow links; the reader presses one button.
  - For email headers, `POST /api/brief?action=unsubscribe&s=…&t=…` with body `List-Unsubscribe=One-Click` implements RFC 8058 one-click unsubscribe.
- **No public listing.** The public endpoint only accepts `subscribe` and `unsubscribe`. The list, the CSV and manual unsubscribes exist only behind the /admin login, session cookie and CSRF token.

Records live under `brief:sub:<id>` with an index in the sorted set `brief:index`. Nothing about subscribers is written to GitHub, the static site, public JSON or browser storage.

## Sending the Brief (not built yet: choose a provider)

Nuvellum deliberately does not run a mail server or send bulk mail from the Google Workspace mailbox. Deliverability, bounce handling and legal footers belong with a campaign provider. The admin **Export CSV** gives active subscribers with their consent time and personal unsubscribe URL, ready to import.

Free tiers as reported in September 2026. **Verify on each provider's pricing page before choosing**, because they change (MailerLite cut its free plan in 2026).

| Provider | Free tier (reported) | Notes |
| --- | --- | --- |
| Kit (ConvertKit) | up to 10,000 subscribers | Creator/newsletter focused; Kit branding on free emails. Strong fit for a daily brief. |
| Brevo | 300 emails/day, large contact allowance | Daily cap limits a daily Brief to about 300 readers on free. EU-based. |
| MailerLite | 250 subscribers, 2,500 emails/month (from June 2026) | Now too small for a daily send beyond a trial. |
| Buttondown | small free tier; check current limits | Markdown-first, API-friendly, indie. |
| listmonk (self-hosted, open source) | free software; needs a server plus an SMTP relay | Most control, no lock-in, but it is infrastructure to run. Not recommended for v1. |

Recommendation for v1: **Kit free** (headroom for growth, and newsletter-native), with Nuvellum's own list remaining the consent record.
- Before the first issue, name the provider on /privacy.
- Import via CSV.
- Keep unsubscribes in sync: either point the provider's unsubscribe at Nuvellum's link, or periodically mark provider unsubscribes in /admin.

Any paid plan needs explicit approval first.

## Deleting a subscriber entirely

Unsubscribing keeps a minimal record, so a reactivation is honest and the reader is not re-imported by mistake. For a full erasure request, delete the key `brief:sub:<id>` and its `brief:index` member in the Upstash console. The id appears in the admin row data and in the CSV unsubscribe URL (`s=`).
