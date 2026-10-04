# Nuvellum operations runbook

For an engineer who did **not** build Nuvellum. Read [`LIVE_STATE.md`](LIVE_STATE.md) first; it gives the current facts. This file says how the system works, how to pause it, and how to repair it.

Golden rules:
- The website must keep serving. Every automation here is optional except the site itself.
- **Pausing is always safe.** Pause first, then investigate.
- Never paste or commit secret values. This document names secrets; it never contains them.
- Don't redesign the site or rewrite published articles. See [`../AGENTS.md`](../AGENTS.md) for the hard rules.

---

## A. System overview

```
RSS feeds ──► n8n newsroom (hourly) ──► GitHub branch incoming/<slug>-<hash> ──► checks ──► PR
                (draft, review,                                                           │
                 verify, dedupe)                       publication gate (auto-publish) ◄──┘
                                                         │ merge (1 per hour, ≤24/day)
                                                         ▼
                                   main ──► Vercel production build ──► www.nuvellum.news
                                     │
                                     └─► social cards (social-assets) ──► social publisher ──► Telegram
                                                                            (ledger: social-ledger)
Brief (daily email): GitHub cron ──► /api/brief-send on Vercel ──► Resend
Observability: on every push to main + every 6 h ──► smoke tests + owner alerts (GitHub issues)
```

| Component | What it does | Critical? |
| --- | --- | --- |
| **Vercel** | Builds and serves the static Astro site from `main`, plus the serverless functions `api/brief.js`, `api/brief-send.js` and `api/admin.js`. Hobby plan. | **Critical**: this is the website. |
| **GitHub `main`** | Source of truth: articles are Markdown in `src/content/articles/`. Every merge to main deploys. | **Critical** |
| **n8n (cloud)** | The newsroom. Every hour it reads RSS feeds, picks one candidate story, drafts it with Gemini, runs the editorial review (and sensitive verification), checks for duplicates, and commits the article to a new `incoming/**` branch. It never touches `main`. | Optional: with n8n off, the site just stops getting new stories. |
| **GitHub Actions** | Checks on every incoming branch (Build, Security, CodeQL, duplicate guard, photo acquisition); the auto-opened PR; the **publication gate**, which is the only thing that merges stories; social cards; social posting; Brief trigger; observability. | The gate is what keeps bad stories off the site. Everything else is optional. |
| **`social-assets` branch** | A storage-only branch (never deployed). Branded social cards (`cards/<slug>/`) and Shorts (`shorts/<slug>/`). Served publicly through jsDelivr for platforms that fetch media by URL. | Optional |
| **`social-ledger` branch** | A storage-only branch (never deployed). One JSON file per story (`ledger/<slug>.json`) recording each platform's status. This is what prevents duplicate posts. `shorts/` holds the Shorts ledger. | Optional, but **never delete it**: losing it allows duplicate posts. |
| **The Brief** | A daily email of recent stories to subscribers. Sign-up and unsubscribe run on Vercel functions; subscribers are stored in Upstash Redis (free); email goes through Resend (free tier). | Optional |
| **Observability** | Newsroom health report, production smoke test and engine tests, and **owner alerts**: one GitHub issue labelled `ops-alert` per real problem, closed automatically when it clears. | Optional, but it's your early warning. |
| **GA4 / Search Console** | Consent-first analytics; Google indexing. | Optional |

Key files:
- **Publication policy:** `scripts/lib/editorial.mjs`.
- **Gate and its limits:** `scripts/auto-publish.mjs` and `scripts/lib/publication-chain.mjs`.
- **Social:** `engines/publish/`.
- **Alerts:** `scripts/lib/alerts.mjs`.
- **n8n export:** `n8n/workflows/nuvellum-newsroom.json`.

---

## B. Normal schedules

All times are UTC. **GitHub's cron is best-effort:** it skipped most scheduled runs on 2026-10-01. Everything critical is therefore triggered by events, and cron is a backup.

| Job | When | Notes |
| --- | --- | --- |
| n8n newsroom | **Every hour at :00** (n8n's own scheduler, reliable) | ≤ 1 incoming PR per run |
| Checks on `incoming/**` | On every push from n8n or the visual pass | Build Nuvellum, Security checks, CodeQL, Editorial duplicate guard, Acquire editorial visual |
| Auto-open editorial PR | On push to `incoming/**` | Opens the PR (audit trail) |
| **Publication gate** (`auto-publish.yml`) | **When any required check finishes** on an incoming branch (normally a few minutes past each hour); cron backup at :07, :27 and :47 | ≤ 1 merge per ~hour (≥ 50 min gap), ≤ 24/day; closes stale news (> 6 h) |
| Social cards (`social-card-assets.yml`) | Dispatched by the gate after each merge (also on article pushes to main) | Also sweeps recent stories that have no cards |
| **Social publisher** (`social-publish.yml`) | Dispatched by the card workflow right after cards are stored; **backup cron hourly at :35** | One story per run |
| Production deploy | Vercel, on every push to `main` (skipped for docs/workflow/engine/n8n-only commits) | ~1–3 min |
| Brief (`brief-send.yml`) | 06:17, 07:47 and 10:29 daily (idempotent: only the first one sends). Push to main runs a **dry run** | |
| Observability (`observability.yml`) | Every push to main; cron every 6 h at :23 | Owner alerts |
| CodeQL / Security | Pushes, PRs, plus weekly cron | |
| Shorts | **Manual only** (`shorts-autopilot.yml`, `shorts-preview.yml`, `short-assets.yml`) | Deferred product |
| Branch cleanup | Manual (`cleanup-merged-branches.yml`) | Deletes only branches whose PR merged and that haven't moved since |

---

## C. Emergency switches

Settings paths: GitHub repository **Sh-010/Nuvellum → Settings → Secrets and variables → Actions → Variables** (`https://github.com/Sh-010/Nuvellum/settings/variables/actions`).

| Goal | How | Effect |
| --- | --- | --- |
| **Stop article autopublishing** | Set variable `NUVELLUM_AUTOPUBLISH` to `off` | The gate only evaluates and reports. Nothing merges and nothing is closed as stale. n8n can keep producing PRs; they wait. The website keeps serving. |
| **Hold one story** | Add the label `hold` (or `do-not-publish` / `needs-human`) to its PR | The gate skips it; it's never auto-closed as stale. |
| **Stop all social posting** | Set variable `NUVELLUM_SOCIAL` to `off` | The publisher only prints its plan. The ledger is unchanged, so turning it back on doesn't dump a backlog (it still posts one story per run). |
| **Pause Telegram only** | Delete (or rename) the secret `TELEGRAM_BOT_TOKEN` | Telegram records `skipped (not configured)`. Article publication is unaffected. To resume, re-add the secret: create a new token with @BotFather if the old one is lost, and update `TELEGRAM_BOT_TOKEN`. |
| **Deactivate n8n** | n8n → open workflow `8hXx6NuZuJU9dRR1` → toggle **Active** off (or **Unpublish**) | No new stories. Nothing else changes. |
| **Re-enable n8n** | n8n → open the workflow → **Publish**/activate the latest version. Check that the Schedule Trigger says every 1 hour and that **Executions** shows a run at the next :00. | |
| **Disable one GitHub workflow** | GitHub → **Actions** → choose the workflow → **⋯ → Disable workflow** | Re-enable the same way. Never disable the checks the gate requires (Build, Security, CodeQL, duplicate guard, visual) unless you have also set `NUVELLUM_AUTOPUBLISH=off`. Otherwise stories just wait. |
| **Keep production on the last healthy build** | Vercel → project → **Deployments** → open the last good **Production** deployment → **⋯ → Promote to Production** (or **Instant Rollback**) | Serves that build regardless of what is in `main`, until the next production deploy. Pair it with `NUVELLUM_AUTOPUBLISH=off` so new merges don't redeploy. |
| **Lower the publishing rate** | Variable `NUVELLUM_PUBLISH_DAILY_CAP` (default 24; `0` pauses merging) | |

---

## D. Failure playbooks

Format: **symptom → likely cause → inspect → safe fix.**

### n8n stops firing
- **Symptom:** no new `incoming/**` PRs for hours, or the alert issue "Newsroom silent for Nh".
- **Likely cause:** the workflow is inactive, the n8n Cloud plan is paused or over its limits, or a credential failed (Gemini key, GitHub token).
- **Inspect:** n8n → the workflow → **Executions** (error runs, and whether anything ran at :00); the workflow's Active toggle.
- **Safe fix:** reactivate it, or fix the credential (re-bind it by name in the failing node). If the workflow itself is lost or corrupted, follow [n8n recovery](#n8n-recovery-restore-the-newsroom-workflow).

### An incoming PR never merges
- **Symptom:** an open `incoming/**` PR older than ~1 h.
- **Likely cause:**
  - a gate rule failed: not cleared, or a failed or missing check;
  - the hourly or daily limit;
  - a `hold` label;
  - the gate wasn't triggered.
- **Inspect:** Actions → **Auto-publish verified editorial stories** → the latest run's summary lists `HOLD` reasons, `WAIT` (limit) or `MERGED`. The PR's checks tab.
- **Safe fix:**
  - **Limit:** wait for the next hour.
  - **Failed check:** fix it, or close the PR.
  - **Gate not triggered:** Actions → Auto-publish → **Run workflow** with `dry_run` unticked. The gate still applies every rule.
  - **Never merge a story PR by hand** to "unstick" it.

### A photo commit makes the checks disappear (PR blocked: "required status checks are expected")
- **Likely cause:** the visual pass pushed with `GITHUB_TOKEN` (no push checks) because `NUVELLUM_DEPLOY_KEY` is missing. Dispatched checks never attach to a PR.
- **Inspect:**
  - **Secrets:** is `NUVELLUM_DEPLOY_KEY` present?
  - **Deploy keys:** Settings → **Deploy keys**, is "Nuvellum visual engine" there with write access?
- **Safe fix:**
  - **Restore the key pair** (see [deploy key](#deploy-key-removed-or-revoked)).
  - **Unstick old PRs:** use the PR's **Update branch** button. That is a normal push, so the checks run and attach.

### A Vercel deployment fails
- **Inspect:** Vercel → Deployments → the failed one → Build logs. Locally: `npm ci && npm run build`. A known case: `assets/nuvellum-v5.zip` checksum mismatch (see [`RECOVERY.md`](RECOVERY.md)).
- **Safe fix:** production keeps serving the previous deployment automatically. Fix it in a PR, or `git revert` the offending commit. Don't force-push.

### Production stays stale after a merge
- **Inspect:**
  - the commit's Vercel status on GitHub. "Canceled by Ignored Build Step" means the commit only touched docs, workflows, engines or n8n, which is expected;
  - "Deployment rate limited" means the Hobby limit was hit.
- **Safe fix:**
  - **Rate limit:** wait; the next production-relevant commit deploys. Don't make "poke" commits.
  - **Otherwise:** Vercel → Deployments → **Redeploy** the latest `main`.

### Social cards are missing for a story
- **Inspect:**
  - **Card runs:** Actions → **Publish social card assets**.
  - **Branch contents:** `social-assets` → `cards/<slug>/`.
- **Safe fix:** Actions → Publish social card assets → **Run workflow** with `slugs` set to the slug. Its sweep also catches recent stories that have no cards.

### Telegram doesn't post
- **Inspect:**
  - **Publisher runs:** Actions → **Social publish**. Did it run after the card job? The log line `Social publisher (LIVE …)` shows the decision.
  - **Ledger:** `social-ledger/ledger/<slug>.json` → `platforms.telegram`.
  - **Variable:** `NUVELLUM_SOCIAL=on`?
- **Likely cause:**
  - the story wasn't live yet (status `queued`, retried on the next run);
  - a newer story was posted instead (one per run, by design);
  - token revoked (alert `credentials:telegram`);
  - the bot was removed as channel admin.
- **Safe fix:**
  - **Credential problems:** fix the token or channel admin.
  - **Post one specific story:** Social publish → **Run workflow** with that `slug`. The ledger prevents a duplicate.

### social-ledger conflict
- **Symptom:** "could not save the ledger" in a Social publish or Shorts run.
- **Likely cause:** two writers raced. The workflows retry `pull --rebase` 3 times.
- **Safe fix:** re-run the workflow. Never force-push `social-ledger` and never delete files from it: that would re-enable posting of stories already sent.

### Stale editorial PR backlog
- **Normal behaviour:** with the gate on, News PRs open more than 6 h are closed automatically with the label `stale` and a comment (branch kept).
- **Inspect:** the PR list filtered by `is:pr is:open head:incoming/`.
- **Safe fix:**
  - **Reconsider a story:** reopen its PR, and the gate re-evaluates it. A News PR will be closed again if it's still over 6 h.
  - **Long-life formats** (Explainer and the rest) never expire. Close them by hand if they're unwanted.

### The Brief doesn't send
- **Inspect:**
  - **Brief runs:** Actions → **Send Nuvellum Brief**. The response JSON gives the reason: `already-sent-today`, `no-new-stories`, `no-active-subscribers`, or the HTTP code.
  - **Vercel env:** `RESEND_API_KEY`, `RESEND_BRIEF_TOPIC_ID`/`RESEND_BRIEF_SEGMENT_ID`, the KV/Upstash variables, `NUVELLUM_BRIEF_SECRET`.
  - **Resend:** dashboard limits.
- **Safe fix:**
  - **Re-send today:** Actions → Send Nuvellum Brief → **Run workflow** with `send` ticked. It's idempotent: it never sends twice on one day.
  - **HTTP 503 "safety cap":** the subscriber count exceeded the configured cap (Resend free tier). Raise the cap knowingly, or move plans.

### GA4 stops receiving data
- **Inspect:**
  - **View source** on production: `G-MYKD3ELQTN` should be present.
  - **Vercel env:** `NUVELLUM_GA4_ID` in Production.
  - **Browser:** Allow on the consent banner, then the GA4 Realtime report.
- **Safe fix:** restore `NUVELLUM_GA4_ID` in Vercel → Settings → Environment Variables (Production), then redeploy. It's read at build time.

### Search Console indexing issue
- **Inspect:**
  - **Sitemap:** `https://www.nuvellum.news/sitemap.xml` loads, and `robots.txt` names it.
  - **Search Console:** Pages / Sitemaps reports.
- **Safe fix:** resubmit the sitemap in Search Console. The domain property is verified by DNS, so keep the DNS TXT record. Unpublished or noindex pages are excluded on purpose.

### GitHub scheduled jobs get skipped
- **Expected:** GitHub delays or drops cron often for this repo. The critical paths are event-driven. Nothing to fix unless an event-driven job also stopped.
- **Manual nudge:** Actions → the workflow → **Run workflow**.

### Deploy key removed or revoked
1. Generate a new key pair on a trusted machine: `ssh-keygen -t ed25519 -N "" -C nuvellum-visual-engine -f nuvellum_deploy_key`.
2. Settings → **Deploy keys** → Add deploy key. Title "Nuvellum visual engine"; paste the `.pub` contents; tick **Allow write access**.
3. Settings → **Secrets** → set `NUVELLUM_DEPLOY_KEY` to the private key file's full contents, including the BEGIN/END lines.
4. Delete both local key files.

### Token or credential expiry
- **Symptom:** the alert issue `credentials:<platform>`, or n8n executions failing at a GitHub or Gemini node.
- **Safe fix:** rotate at the provider, then update the secret or n8n credential **by the same name**. See the inventory below.

### GitHub Actions quota or rate limits
- **Facts:** the repo is public, so Actions minutes are free.
- **API rate limits:** the gate stops evaluating once its hourly limit is reached, and each workflow uses its own `GITHUB_TOKEN`.
- **Safe fix:** if a run fails with "API rate limit", re-run it later.

### Vercel Hobby limit (100 deployments/day)
- **Symptom:** commit status "Deployment rate limited — retry in 24 hours" (alert `deploy`).
- **Safe fix:** stop non-essential merges. The cap (≤ 24 stories/day) and the ignored build step keep normal traffic well under the limit. The next production-relevant commit after the window clears will deploy.

### n8n recovery: restore the newsroom workflow
The repository holds the sanitized canonical workflow: [`n8n/workflows/nuvellum-newsroom.json`](../n8n/workflows/nuvellum-newsroom.json). It has no credentials, and it matches live version `5e78c5f1`.
1. n8n → **Workflows → Import from File** → choose that file. Keep its name. Do **not** run a second copy alongside a live one.
2. Re-bind credentials by name in the nodes that need them:
   - Gemini nodes: Google Gemini (PaLM) API credential;
   - GitHub HTTP nodes: Header Auth credential with a GitHub token able to push branches to `Sh-010/Nuvellum`.
3. Run it once manually and watch **Executions**: it should finish with a `run_summary`, and at most one `incoming/**` branch should appear.
4. **Publish/activate** it. Verify: Active is on; the Schedule Trigger says **every 1 hour** (minute 0); the next :00 shows a "trigger" execution.
5. If it got a new workflow id, update [`LIVE_STATE.md`](LIVE_STATE.md), the [`n8n/README.md`](../n8n/README.md) and the newsroom-silent alert text in `scripts/lib/alerts.mjs`.

---

## E. Credential inventory

Names only. "Present" was checked on 2026-10-01 via the GitHub API (secrets are listed by name only) or by observed behaviour.

### GitHub Actions — secrets

| Name | Purpose | Required? | Present | Expiry / rotation | Depends on it |
| --- | --- | --- | --- | --- | --- |
| `NUVELLUM_DEPLOY_KEY` | Private SSH deploy key; the visual pass pushes photo commits with it | **Yes** (auto-merge of photo stories) | Yes | No expiry; rotate if exposed | `visual-acquire.yml` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot | Yes for Telegram | Yes | No expiry; revoke/reissue via @BotFather | `social-publish.yml`, owner alerts |
| `TELEGRAM_CHAT_ID` | Channel to post to (`@nuvellum`) | Yes for Telegram | Yes | — | `social-publish.yml` |
| `TELEGRAM_ALERT_CHAT_ID` | Owner's private chat for alert DMs | Optional | No | — | `observability.yml` |
| `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN` | Facebook Page posts and Reels | Optional (not live) | No | Long-lived Page token; renew if revoked | `social-publish.yml`, `shorts-autopilot.yml` |
| `INSTAGRAM_USER_ID`, `INSTAGRAM_TOKEN` | Instagram feed and Reels | Optional (not live) | No | ~60 days if user token | same |
| `THREADS_USER_ID`, `THREADS_TOKEN` | Threads | Optional (not live) | No | **60 days** | `social-publish.yml` |
| `LINKEDIN_ORG_URN`, `LINKEDIN_TOKEN` | LinkedIn Page | Optional (not live) | No | **60 days** | `social-publish.yml` |
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | X (paid) | Off by decision | No | — | `social-publish.yml` |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` | YouTube Shorts (deferred) | No | No | Refresh tokens expire after 7 days if the OAuth app is in "Testing" | `shorts-autopilot.yml` |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN` | TikTok (deferred) | No | No | Refresh token ~1 year | `shorts-autopilot.yml` |
| `GITHUB_TOKEN` | Built-in per-run token | Automatic | — | Per run | all workflows |

### GitHub Actions — variables (non-secret)

| Name | Current | Meaning |
| --- | --- | --- |
| `NUVELLUM_AUTOPUBLISH` | `on` | Gate kill switch |
| `NUVELLUM_SOCIAL` | `on` | Social posting kill switch |
| `NUVELLUM_PUBLISH_DAILY_CAP` | unset (default 24) | Max automatic merges per 24 h |
| `NUVELLUM_SHORTS_PUBLISH` | unset | Must be `on` (plus a manual tick) before any Short could post publicly |
| `NUVELLUM_X_BUDGET_APPROVED` | unset | `yes` approves paid X posting |
| `TIKTOK_AUDITED` | unset | `yes` after TikTok's audit |
| `NUVELLUM_ASSET_BASE` | unset | Overrides the public media URL base (jsDelivr) |

### Vercel — environment variables (Production)

| Name | Purpose | Required? | Present | Notes |
| --- | --- | --- | --- | --- |
| `NUVELLUM_GA4_ID` | GA4 measurement ID (public value) | For analytics | Yes (observed on production) | Read at build time |
| `RESEND_API_KEY` | Brief email sending | For the Brief | Yes (dry run succeeded) | Rotate at Resend |
| `RESEND_BRIEF_TOPIC_ID` / `RESEND_BRIEF_SEGMENT_ID` | Brief audience in Resend | For the Brief | Yes (inferred) | |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) | Brief subscriber store | For the Brief | Yes (inferred) | Upstash free tier |
| `NUVELLUM_BRIEF_SECRET` | Keys subscriber records (HMAC of the address) and signs unsubscribe links | For the Brief | Yes (inferred) | **Don't rotate casually:** it orphans existing subscriber keys and invalidates old unsubscribe links |
| `NUVELLUM_ADMIN_PASSWORD`, `NUVELLUM_ADMIN_SESSION_SECRET` | `/admin` login | For admin | Unknown | |
| `NUVELLUM_GITHUB_TOKEN` | `/admin` writes to GitHub | For admin | Unknown | GitHub token expiry |
| `NUVELLUM_ADSENSE_PUB_ID` | ads.txt | No (ads deferred) | No | |
| `SITE_URL` | Canonical site URL | Optional | — | |

### n8n credentials (in n8n Cloud, never in the repo)

| Credential type | Purpose | Expiry risk |
| --- | --- | --- |
| Google Gemini (PaLM) API | Drafting, review, verification, duplicate judge, SVG | Key can be revoked; free-tier quota |
| Header Auth (GitHub token) | Create `incoming/**` branches and commit articles | **GitHub PATs expire.** When it does, n8n runs fail and the "newsroom silent" alert fires within 12 h |

Other accounts: Vercel (Hobby), n8n Cloud, Resend, Upstash, Google (GA4 and Search Console, with a DNS TXT record), Telegram (bot plus channel admin), and the registrar/DNS for `nuvellum.news`.

---

## F. External approvals

| Platform | State |
| --- | --- |
| **Meta** (Facebook, Instagram, Threads) | **Blocked externally.** Code is ready, but a Meta app with App Review (`pages_manage_posts`, `instagram_content_publish`, `threads_content_publish`) and Business Verification are needed, plus tokens. See [`SOCIAL_PLATFORM_SETUP.md`](SOCIAL_PLATFORM_SETUP.md). |
| **LinkedIn** | **Blocked externally.** The Community Management API is open only to a registered legal entity. |
| **TikTok** | **Deferred** (video), and it needs TikTok's Content Posting audit for public posts. |
| **YouTube** | **Deferred** (video). Uploads from an unaudited API project stay private until Google's compliance audit. |
| **X** | **Off by decision** (paid API). Not a dependency. |

---

## G. If Nuvellum breaks tonight

1. **Pause the risky automation:**
   - set `NUVELLUM_AUTOPUBLISH=off`;
   - if posts look wrong, set `NUVELLUM_SOCIAL=off`;
   - if stories look wrong, deactivate the n8n workflow.
2. **Keep the site up:** if the latest deploy is broken, Vercel → Deployments → promote the last good Production deployment (Instant Rollback).
3. **Inspect:**
   - Actions run summaries (Auto-publish, Social publish, Observability);
   - open `ops-alert` issues;
   - n8n **Executions**;
   - Vercel build logs.
4. **Fix it in a PR,** or by `git revert` on a branch. Run `npm test && npm run build`, then merge. Never force-push `main`, `social-ledger` or `social-assets`.
5. **Re-enable in reverse order:**
   - set `NUVELLUM_SOCIAL=on`, then `NUVELLUM_AUTOPUBLISH=on`, then reactivate n8n;
   - watch the next :00 run, the gate's next decision, and the next Telegram post.

---

## Checkpoint and rollback

The known-good autonomous baseline is the Git tag **`nuvellum-autonomous-v1`**. It covers:
- hourly newsroom, one story per run;
- the guarded gate with 50-minute gaps, a 24/day cap and stale cleanup;
- cards, the Telegram path, the Brief, observability and analytics;
- Shorts deferred.

To roll back safely:
- **Website only:** Vercel → promote the deployment built from that tag's commit, or any later good one.
- **Code:** create a branch from the tag, open a PR that reverts `main` to it (`git revert <bad commits>`, or restore specific files with `git checkout nuvellum-autonomous-v1 -- <path>`), and merge. Don't reset or force-push `main`.
- **n8n:** re-import `n8n/workflows/nuvellum-newsroom.json` as checked out at the tag.

Earlier references are listed in [`RECOVERY.md`](RECOVERY.md).
