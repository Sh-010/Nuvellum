# Nuvellum — live state

**Read this first.** It is a short, factual snapshot of how production runs right now. To operate, pause or repair it, see [`RUNBOOK.md`](RUNBOOK.md). History is in [`../WORKLOG.md`](../WORKLOG.md).

_Last verified: 2026-10-01 (UTC)._

## What runs, and how often

| Piece | State |
| --- | --- |
| **Newsroom (n8n)** | Canonical workflow **"Nuvellum v6.5 — Fixed Source Resolution"**, id `8hXx6NuZuJU9dRR1`, active version `5e78c5f1-0abd-48ec-ab12-2789af76ec6f` (69 nodes), on n8n Cloud (`habibiisu.app.n8n.cloud`). Runs **every hour at minute 0 (UTC)**. Each run reads 27 RSS feeds and queues up to 5 candidates. The first one that clears every gate is committed, and the rest are skipped (`run_quota`). That is **at most one incoming PR per run**. The sanitized export is [`../n8n/workflows/nuvellum-newsroom.json`](../n8n/workflows/nuvellum-newsroom.json); it is identical to live. |
| **Publication gate** | `.github/workflows/auto-publish.yml` plus `scripts/auto-publish.mjs`. Repository variable `NUVELLUM_AUTOPUBLISH=on`. It merges a cleared `incoming/**` PR only when every rule in `scripts/lib/editorial.mjs` passes. **1 merge per hourly slot** (the previous merge must be ≥ 50 min old) and **24 per rolling day**, newest first. Time-sensitive candidates (News, breaking/developing) waiting **> 6 h** are closed as `stale` (branch kept). It is triggered when required checks finish on an incoming branch, with a cron sweep as backup. |
| **Editorial gates** | Unchanged. Low risk needs `editorialReview: passed`. Sensitive stories also need `verification: cleared` and `reviewedBy: "Nuvellum Verification Pipeline"`. Opinion/Essay/Ideas/Review are human-led, never automatic. Duplicate guard, quality rules, and green required checks on the exact head SHA. |
| **Photos** | `visual-acquire.yml` picks a licensed Wikimedia photo (story photo, else a representative photo of the subject, else text-led). It pushes with the **deploy key** (`NUVELLUM_DEPLOY_KEY`) so the required checks attach to the PR. |
| **Deploys (Vercel, Hobby)** | Production = `main` → https://www.nuvellum.news. Healthy. The Ignored Build Step (`scripts/vercel-ignore-build.sh`) skips commits that only touch `.github/`, `docs/`, `tests/`, `engines/`, `ops/`, `n8n/`, `WORKLOG.md` or `README.md`. Artifact branches `social-assets` and `social-ledger` carry their own `vercel.json` (deployments disabled): **0 deployments**. |
| **Social cards** | After every automatic merge, the gate dispatches `social-card-assets.yml`. It renders and verifies branded cards and stores them on `social-assets` (public via jsDelivr). Each run also sweeps recent stories that have no cards. |
| **Social feed posting** | `social-publish.yml` is started by the card workflow right after cards are stored (`after_cards`). The **hourly :35 cron is a backup only**. At most **one story per run** (queued retry first, else the newest actionable), only once the page answers 200. Ledger on `social-ledger`; `sent`/`failed` are final, so there are no duplicates. `NUVELLUM_SOCIAL=on`. |
| **Brief (email)** | `brief-send.yml` runs daily at 06:17, with idempotent backups at 07:47 and 10:29 UTC. It calls `/api/brief-send` (GitHub OIDC auth) → Resend. One issue per day (sent-key + lock), a recipient safety cap, and QA addresses excluded. |
| **Observability** | `observability.yml` runs on every push to main and every 6 h (cron, best effort): newsroom health, production smoke test (~344 checks) and engine tests. **Owner alerts** open an `ops-alert` issue that @-mentions the owner and closes itself when the condition clears. |
| **Analytics** | GA4 `G-MYKD3ELQTN` (public measurement ID, Vercel env `NUVELLUM_GA4_ID`) is **live**: consent-first, one `page_view` with `page_type`, no PII, UTM attribution works. Search Console: domain property verified; sitemap at `/sitemap.xml` (referenced in `robots.txt`). |

## Social platforms

| Platform | State |
| --- | --- |
| Telegram (`@nuvellum`) | **Live, automatic.** Branded square card + caption + tracked link. |
| Facebook Page | Code complete; **no credentials** (Meta app + App Review pending). |
| Instagram | Code complete (portrait card JPEG); **no credentials** (Meta App Review pending). |
| Threads | Code complete; **no credentials** (Meta App Review pending). |
| LinkedIn Page | Code complete; **no credentials** (Community Management API needs a registered legal entity). |
| X | Code complete; **off by decision** (paid API; needs `NUVELLUM_X_BUDGET_APPROVED=yes`). |
| YouTube / TikTok / Reels | **Deferred.** The current still-image Shorts renderer is a manual fallback only: no schedule, and no public posting unless `NUVELLUM_SHORTS_PUBLISH=on` (not set). The intended product is a future generative-video engine. |

## Last verified automation events

See the "Verification" entry in [`../WORKLOG.md`](../WORKLOG.md) for 2026-10-01 for links. In short:
- **Unattended newsroom runs:** executions 951–955 fired on schedule hourly. Each produced at most one PR, and the rest were logged as `run_quota`.
- **Automatic merges by the gate (`github-actions[bot]`):**
  - #204, #206 (sensitive, verified) and #207 at 14:03 UTC;
  - #211 and #212 at 15:04–15:05;
  - #210 at 17:01, #216 at 18:04 and #221 at 20:01;
  - each was followed by a successful production deploy.
- **Telegram:** see the handoff entry in WORKLOG (the first post through the new after-cards trigger).

## Known limitations and open risks

- **GitHub scheduled runs are unreliable for this repository.** On 2026-10-01 only one scheduled run fired in ~7 hours. Everything critical is now event-driven, and cron is only a backup. Observability's 6-hourly runs may be sparse; it also runs on every push to main.
- **Credentials with expiry.** The n8n GitHub token, the Gemini key (n8n), and any future Meta/LinkedIn/YouTube tokens. See [`RUNBOOK.md` → Credential inventory](RUNBOOK.md#e-credential-inventory).
- **The deploy key is load-bearing.** If `NUVELLUM_DEPLOY_KEY` or the matching deploy key is removed, stories that get a photo can no longer auto-merge (branch protection).
- **Vercel Hobby: 100 deployments/day.** At ≤ 24 stories/day plus code merges we are well inside it. Docs/workflow/engine-only commits don't build.
- **Social backlog:** only the newest story is posted per run, so stories published while social was down are not all posted later (deliberate: no dumping).
- **Closed-unmerged `incoming/*` branches** from the 2026-09-28 test runs are kept as evidence. They only block re-drafting those exact old sources.
