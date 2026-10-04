# Social distribution

Nuvellum's social-distribution layer supports both safe dry runs and live posting. Live posting is isolated from article publication and only runs for configured platforms when `NUVELLUM_SOCIAL=on`.

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

The social-card renderer is implemented. Every published story gets a deterministic 1080×1080 square card and 1080×1350 portrait card in Nuvellum's ivory/charcoal/burgundy editorial system. When a real photo or approved illustration exists it is embedded into the card; text-led stories use typography, rules and the N✦ mark instead of fake imagery. Instagram uses the portrait card while the other feed targets use the square card. The short-video track is the Shorts autopilot (`docs/SHORTS_ENGINE.md`). It renders verified Shorts automatically and hands them to the video platforms through its own ledger.

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

### Cards after automatic publication

The publication gate merges with `GITHUB_TOKEN`, which fires no push workflows. After every merge it therefore **dispatches** `social-card-assets.yml` with the published slugs.

Every card run also sweeps stories published in the last 48 hours that have no `cards/<slug>/manifest.json` on `social-assets` (up to six per run). A dispatch GitHub dropped, or a run that failed, is caught by the next one. **Publishing rate.** n8n runs hourly and each run creates **at most one** publishable incoming PR: the strongest eligible, non-duplicate story of the run (n8n `One Story Per Run` guard). The publication gate is a second limit: one merge per hourly slot (another may merge once the previous merge is **at least 50 minutes old**, because the gate runs when each hourly push lands a few minutes past the hour), and at most `NUVELLUM_PUBLISH_DAILY_CAP` (default 24) per rolling 24 hours. **Freshness:** the newest approved story goes first, and a time-sensitive candidate (News, or flagged breaking/developing) that has waited **more than 6 hours** is closed as stale. It gets a `stale` label and a comment giving the reason; its branch and article are kept, and reopening the PR reconsiders it. Explainer, Analysis, Review, Essay, Opinion and Ideas candidates do not expire this way. Every gate run sweeps all open incoming PRs, and once the limit is reached it stops evaluating.

## Live posting (`engines/publish/`, `.github/workflows/social-publish.yml`)

Live posting is **on** (`NUVELLUM_SOCIAL=on`). Telegram posts automatically; a platform posts only when its credentials exist.

- **When.** Right after each newly published story's cards are stored. The card workflow dispatches the publisher (`after_cards`), which then sweeps for **one** story: a queued retry first, otherwise the newest actionable one. An hourly run at minute 35 remains as a backup/recovery sweep, because GitHub's scheduled runs proved unreliable for this repository. A manual dispatch with a `slug` posts that story only. Every route posts at most one story per run, and the ledger prevents duplicates.
  - A scheduled run evaluates the rolling 48-hour window but posts **at most one story** across all configured platforms.
  - A queued retry is cleared first; otherwise the newest actionable story is selected.
  - A manual dispatch must name a `slug`, and then posts that story only.
  - The GitHub Actions UI no longer exposes a bulk-post switch. This is deliberate: activating a new platform must not dump the recent backlog into followers' feeds.
- **What.** Stories that reached `main` in the last 48 hours, plus any story with a queued platform. A story is posted only once its page answers 200 on www.nuvellum.news. Drafts, placeholders and unpublished stories are never eligible.
- **Separate from publishing.** This is a separate workflow. The build, the publish gate and the site never wait on it, so a social failure cannot block or undo publication.

| Platform | Adapter | Credentials (GitHub Actions secrets) | Notes |
| --- | --- | --- | --- |
| **Telegram** (first) | Bot API `sendPhoto` / `sendMessage` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Headline (bold), dek, the story's own photo when it is a JPEG/PNG/WebP, and the tracked link. SVG art and text-led stories go as a text message with a large link preview. Free. |
| Facebook Page | Graph API `POST /{page-id}/feed` (link post) | `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN` (optional `FACEBOOK_GRAPH_VERSION`, default v23.0) | Needs the Meta app and permissions in SOCIAL_PLATFORM_SETUP.md. |
| LinkedIn Page | Posts API `POST /rest/posts` (article post) | `LINKEDIN_ORG_URN`, `LINKEDIN_TOKEN` (optional `LINKEDIN_API_VERSION`) | Needs Community Management API approval. |
| X | API v2 `POST /2/tweets`, OAuth 1.0a | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | **Paid** (about $0.20 per linked post). It also needs the repository variable `NUVELLUM_X_BUDGET_APPROVED` = `yes`; credentials alone never post. |
| Instagram (feed) | Graph API `/{ig-user-id}/media` + `media_publish` | `INSTAGRAM_USER_ID`, `INSTAGRAM_TOKEN` | Posts the verified **portrait card as JPEG** (Instagram accepts JPEG only) by public URL from `social-assets`. If the card isn't there yet, the post stays queued and retries. Needs Meta App Review for `instagram_content_publish`. |
| Threads | Threads API `/{user-id}/threads` (TEXT + link) + `threads_publish` | `THREADS_USER_ID`, `THREADS_TOKEN` | Headline, dek and tracked link. Needs Meta App Review for `threads_content_publish`. The long-lived token lasts 60 days. |
| YouTube, TikTok | video only | — | Recorded `skipped` here. Shorts reach them through the **Shorts autopilot** and its own ledger (`shorts/<slug>.json`, `docs/SHORTS_ENGINE.md`), as do Facebook and Instagram **Reels**. |

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

### Social cards in the publisher

Before a story is posted to a platform that takes an image, the publisher renders its branded cards with the card system (`engines/cards`, `docs/SOCIAL_CARDS.md`). It then rasterises every card to PNG in Chromium and checks every text line against its fitted box. Assets are ephemeral: they are written to `engines/out/social-cards/<slug>/` (gitignored) and discarded with the Actions workspace.

**Which card each platform uses** (`engines/publish/assets.mjs`):

| Platform | Card |
| --- | --- |
| Telegram | square 1080×1080 |
| Facebook, LinkedIn, X | landscape 1200×630 |
| Threads | square |
| Instagram feed | portrait 1080×1350 |
| TikTok, YouTube Shorts | story 1080×1920 |

Quote and key-fact cards are optional extra assets, following the card system's own rules: never for sensitive stories. Only Telegram is live; the other platforms stay unconfigured.

**The flow of one run:**
1. `cli.mjs --needs-cards` reports whether any story in this run is about to be posted to a configured image platform. Only then does the workflow install (and cache) Chromium.
2. For a scheduled run, select one candidate only: a queued retry first, otherwise the newest actionable story. Manual runs use the explicit slug.
   - plan (as before: `sent`/`failed` are final);
   - if an image platform is due, render and verify the cards **once**;
   - then post the same story to whichever configured platforms are due.
3. **Telegram** uploads the verified **square card PNG** with `sendPhoto` as `multipart/form-data`, so no public image URL is needed. The caption is the bold headline, the dek and the tracked "Read on Nuvellum →" link. The ledger records `kind: "card"`.
4. **If rendering fails** (a render error, missing Chromium, a clipped headline, or an overflow in Chromium), nothing is posted with a broken or unbranded image:
   - The platform stays `queued` with `cardFailures` and the error on the first failure, and the story's `cards` field records the failure.
   - On the next run it tries again.
   - After `CARD_RETRIES` (2) failed renders, the platform is marked `failed` and remains unpublished. It does **not** silently fall back to the story's raw photo or a plain text post.
   - This is deliberate: presentation quality fails closed. A rendering bug should be fixed and the affected story deliberately re-queued rather than publishing a lower-quality fallback.
   - Posts are still recorded after every attempt, and `sent` / terminal `failed` states are never revisited, so no failure path can post twice.
5. **Already-sent stories** are neither re-rendered nor re-posted. When nothing is due, Chromium is not even installed.

A safe preview, which renders and verifies the cards and prints the exact Telegram upload and caption without posting or writing the ledger:

```bash
SITE_URL=https://www.nuvellum.news TELEGRAM_BOT_TOKEN=x TELEGRAM_CHAT_ID=@nuvellum \
  node engines/publish/cli.mjs --ledger /tmp/ledger --slug <slug> --render
```

**Turning Telegram on:**
1. In Telegram, create a bot with @BotFather and copy its token.
2. Create the Nuvellum channel and add the bot as an administrator allowed to post.
3. In GitHub → Settings → Secrets and variables → Actions:
   - add the secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (the channel's `@username`, or its numeric id);
   - set the variable `NUVELLUM_SOCIAL` = `on`.
4. Run **Social publish** once from the Actions tab and check the channel and the `social-ledger` branch.
