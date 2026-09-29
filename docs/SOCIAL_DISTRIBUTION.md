# Social distribution

Nuvellum's first social-distribution layer is deliberately **dry-run only**. It prepares platform-specific copy after an article reaches `main`, but it does not post to any social account.

## Flow

```
published article
  -> load safe article payload
  -> generate platform-specific deterministic copy
  -> add per-platform UTM tracking
  -> validate length/link/sensational-language rules
  -> render branded 1:1 and 4:5 social cards
  -> attach the correct card to each feed draft
  -> upload copy + card artifacts through GitHub Actions
```

Nuvellum prepares two parallel distribution tracks:

- **Feed/static:** X, Threads, Facebook, LinkedIn and Instagram.
- **Short video:** X video, Facebook Reels, Instagram Reels, TikTok and YouTube Shorts.

The same text is **not** copied everywhere. Each platform and track gets its own format and tracked link where appropriate.

## Visual rule

Social distribution follows the production visual policy:

```
real relevant photo -> approved story-specific illustration -> designed Nuvellum social card
```

The social-card renderer is implemented. Every published story gets a deterministic 1080×1080 square card and 1080×1350 portrait card in Nuvellum's ivory/charcoal/burgundy editorial system. When a real photo or approved illustration exists it is embedded into the card; text-led stories use typography, rules and the N✦ mark instead of fake imagery. Instagram uses the portrait card while the other feed targets use the square card. The short-video track points to the Shorts/Reels engine described in `docs/SHORTS_ENGINE.md`; video rendering remains dry-run and is not auto-posted.

## Tracking

Links use:

- `utm_source=<platform>`
- `utm_medium=social`
- `utm_campaign=article`
- `utm_content=<article-slug>`

This gives GA4 a clean platform-attribution contract once reader analytics are enabled.

## Running locally

```bash
node engines/distribution/cli.mjs --slug <published-slug>
```

Outputs are written to `engines/out/distribution/<slug>.json` and `engines/out/social-cards/<slug>/`.

## Automation

`.github/workflows/social-distribution.yml`:

- tests the engine on pull requests that change it;
- after a new article reaches `main`, prepares drafts and uploads them as a 30-day artifact;
- supports manual dispatch for a specific slug.

Per-platform account, app, credential and API-restriction requirements: [`SOCIAL_PLATFORM_SETUP.md`](SOCIAL_PLATFORM_SETUP.md).

## Live posting (`engines/publish/`, `.github/workflows/social-publish.yml`)

Live posting is built but **off**. It only posts when the repository variable `NUVELLUM_SOCIAL` is `on` **and** a platform's credentials exist.

- **When.** Every 30 minutes (:12 and :42), and on manual dispatch (optionally for one slug). Auto-published stories reach `main` through `GITHUB_TOKEN` merges, which never trigger push workflows, so a schedule is the reliable hook.
- **What.** Stories that reached `main` in the last 48 hours, plus any story with a queued platform. A story is posted only once its page answers 200 on www.nuvellum.news. Drafts, placeholders and unpublished stories are never eligible.
- **Separate from publishing.** This is a separate workflow. The build, the publish gate and the site never wait on it, so a social failure cannot block or undo publication.

| Platform | Adapter | Credentials (GitHub Actions secrets) | Notes |
| --- | --- | --- | --- |
| **Telegram** (first) | Bot API `sendPhoto` / `sendMessage` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Headline (bold), dek, the story's own photo when it is a JPEG/PNG/WebP, and the tracked link. SVG art and text-led stories go as a text message with a large link preview. Free. |
| Facebook Page | Graph API `POST /{page-id}/feed` (link post) | `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN` (optional `FACEBOOK_GRAPH_VERSION`, default v23.0) | Needs the Meta app and permissions in SOCIAL_PLATFORM_SETUP.md. |
| LinkedIn Page | Posts API `POST /rest/posts` (article post) | `LINKEDIN_ORG_URN`, `LINKEDIN_TOKEN` (optional `LINKEDIN_API_VERSION`) | Needs Community Management API approval. |
| X | API v2 `POST /2/tweets`, OAuth 1.0a | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | **Paid** (about $0.20 per linked post). It also needs the repository variable `NUVELLUM_X_BUDGET_APPROVED` = `yes`; credentials alone never post. |
| Instagram, Threads | none yet | — | Recorded as `skipped` with the reason. |
| YouTube Shorts | video only | — | `skipped` until a reviewed Short exists, then `awaiting_approval`. |
| TikTok | approval-based | — | Always `awaiting_approval`: a human uploads. |

**The ledger.** Every outcome is recorded per platform in `ledger/<slug>.json` on the `social-ledger` branch. That branch never deploys (vercel.json) and triggers no workflows. Each record holds the status, attempts, time, and the remote id and URL or the error.

**Statuses:**
- `queued`: not live yet, or a retryable failure.
- `sent`: posted.
- `failed`: a non-retryable API error, or 3 attempts used up.
- `skipped`: with a reason.
- `awaiting_approval`: needs a human.

**Retries and duplicates.**
- `sent` and `failed` are final, so a story is never posted twice.
- The ledger is written after every individual post, and saved even when the run fails.
- Rate limits and 5xx errors retry, up to 3 attempts; other 4xx errors do not (bad token, wrong chat).
- Error text is trimmed, and any credential that appears in it is redacted.

Dry run locally, which prints the plan and writes nothing:

```bash
SITE_URL=https://www.nuvellum.news node engines/publish/cli.mjs --ledger /tmp/ledger [--slug <slug>]
```

**Turning Telegram on:**
1. In Telegram, create a bot with @BotFather and copy its token.
2. Create the Nuvellum channel and add the bot as an administrator allowed to post.
3. In GitHub → Settings → Secrets and variables → Actions:
   - add the secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (the channel's `@username`, or its numeric id);
   - set the variable `NUVELLUM_SOCIAL` = `on`.
4. Run **Social publish** once from the Actions tab and check the channel and the `social-ledger` branch.
