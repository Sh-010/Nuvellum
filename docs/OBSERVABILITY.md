# Analytics and observability

Nuvellum separates **reader analytics** from **newsroom health**. Both are optional and fail safely.

## Reader analytics

The production build can inject Google Analytics 4 after Astro finishes. It is disabled unless the Vercel environment variable below is configured:

```
NUVELLUM_GA4_ID=G-XXXXXXXXXX
```

No ID is committed to the repository. With the variable absent, the built HTML receives no analytics script.

The ID comes from analytics.google.com → Admin → Data streams → Web. The snippet is in `scripts/lib/analytics.mjs`; `scripts/instrument-analytics.mjs` injects it.

**Consent first.**
- A small notice asks each reader once. Until they choose **Allow**, nothing from Google loads and no cookie is set.
- **No thanks** is remembered (in this browser only), and /privacy has a *Change analytics settings* button.
- Google signals and advertising features are off.
- `NUVELLUM_ANALYTICS_CONSENT=implied` removes the notice. Set it only if you have decided consent is not required for your audience.

**Where.**
- Every public page: home, articles, sections, Latest, World Explorer, the region and country desks, and 404.
- Never on `/admin` or `/brief/*`.
- A page can never initialise it twice, and the build check fails if a page carries it twice.

**Events.** Each carries `page_type`: home, article, section, latest, world_explorer, world, country, author, page or not_found.

- `page_view`: sent once per page by the snippet (gtag's automatic one is off). `page_location` has no query string except utm_* campaign tags.
- `sign_up` (`method: nuvellum_brief`): only after /api/brief confirms a Brief sign-up. No address is sent.
- `scroll_depth` at 25/50/75/90%
- `article_click` (destination path)
- `save_story`
- `outbound_click` (destination domain only)

No names, email addresses, search text, query strings or article-source URLs are sent.

**CSP.** `vercel.json` allows scripts from `www.googletagmanager.com` and connections to `*.google-analytics.com`, `*.analytics.google.com` and `*.googletagmanager.com`.

**Turning it on:**
1. Create a GA4 property with a web stream for https://www.nuvellum.news.
2. Put the measurement ID in Vercel (Production) and redeploy.
3. Optionally, in GA4, mark `sign_up` as a key event and register `page_type` as an event-scoped custom dimension.
4. Open the site, choose Allow, and confirm the visit under GA4 → Reports → Realtime.

Search Console setup is in [SEARCH_CONSOLE.md](SEARCH_CONSOLE.md).

## Newsroom health

`.github/workflows/observability.yml` runs:

- after each push to `main`
- every six hours
- on manual dispatch

It reports:

- total and automated article count
- output in the past 24 hours / 7 days / 30 days
- latest automated publication
- section and risk distribution
- real-photo / AI-illustration / text-led visual mix
- source-host diversity
- latest main-branch Build, Security, CodeQL and duplicate-guard state
- open `incoming/**` editorial PRs
- deployment/check state when GitHub exposes a Vercel/deployment check

The scheduled job **fails only for concrete operational failures**: a core main-branch workflow failure, an explicit deployment failure, or an unheld incoming PR stuck for more than 24 hours while autopublish is on. Publication inactivity is a warning because there may simply be no acceptable candidates.

Run locally:

```bash
npm run ops:report
```

Without a GitHub token the local report still provides all content/repository metrics; GitHub/deployment checks are omitted.

## Live production smoke checks

The observability workflow also runs `node scripts/production-smoke.mjs` against **https://www.nuvellum.news** on every main push and every six-hour scheduled health run.

It verifies:

- core public routes such as Home, Latest, Saved, World Explorer and institutional pages;
- RSS, sitemap, robots, manifest and favicon;
- every same-origin URL currently listed in the production sitemap;
- every published article route in that sitemap;
- same-origin article/homepage images for HTTP success and image content type;
- key homepage/UI markers such as the World Desk, Brief signup and Sports filter;
- that Latest and Sports contain real article links.

The same workflow also runs the distribution/Shorts engine unit suite. This means social/video code can fail health checks without blocking article publication.

A source-concentration warning is emitted when one host supplies more than one third of automated source references once the corpus is large enough. This is a warning for editorial diversity, not a publication failure.

The smoke audit intentionally checks the **deployed site**, not only the build output. A repository build can be green while a stale or failed deployment is still serving something else; this closes that gap.

## Newsroom execution telemetry (n8n)

Each run of the live workflow (`8hXx6NuZuJU9dRR1`) ends with one compact `run_summary` item in the **Run Summary** node. It is stored with the execution in n8n; open the execution and select Run Summary. It comes from three pieces:

- **Queue Latest Candidates** stamps `_queuedAt` and feed-screening counts (`feedItems`, `feedErrors`, `aggregatePages`, `repeats`). The selection is unchanged.
- **Record GitHub Outcome** sits between the GitHub results (article committed; branch creation failed) and the loop. It swaps the GitHub API response, which the loop discards, for whitelisted fields: slug, section, risk, source host, branch/commit status, HTTP status and the image decision.
- **Run Summary** reads the loop's "done" output (every candidate's final item). It classifies each candidate with a fixed reason code and emits counts plus one compact event per candidate.

Execution 939 (the first run with telemetry, 2026-09-28), with the events list shortened:

```json
{ "event": "run_summary", "telemetryVersion": 1, "runId": "939", "mode": "test",
  "queue": { "feedItems": 1318, "feedErrors": 1, "aggregatePages": 80, "repeats": 24 },
  "candidates": 5, "processed": 5, "unaccounted": 0, "reachedDrafting": 4,
  "editorial": { "passed": 3, "failed": 0 }, "verification": { "passed": 2, "failed": 0 },
  "github": { "branchCreated": 3, "pushFailed": 0 }, "published": 3, "rejected": 2,
  "reasons": { "draft_skip": 1, "thin_source": 1 },
  "imageModes": { "photo": 0, "illustration": 2, "textLed": 1 }, "durationMs": 624729,
  "events": [
    { "event": "candidate_rejected", "stage": "draft", "reason": "draft_skip", "slug": null, "section": "Sports", "sourceHost": "bbc.co.uk" },
    { "event": "candidate_rejected", "stage": "source", "reason": "thin_source", "slug": null, "section": "Business", "sourceHost": "cnbc.com" },
    { "event": "candidate_published", "stage": "github", "reason": "published", "slug": "pokemon-tcg-s-next-big-set-available-weeks-before-official-release",
      "section": "Gaming", "sourceHost": "polygon.com", "image": { "mode": "text-led", "reason": "image_rejected_style" }, "risk": "low" } ] }
```


Reason codes, by stage:

| Stage | Codes |
| --- | --- |
| `source` | `thin_source` |
| `dedupe` | `duplicate_source` (`detail`: `open_pr` or `published`), `duplicate_story`, `duplicate_check_failed` |
| `draft` | `draft_skip` (the drafter declined, or the source is opinion or another non-news format), `invalid_geography`, `thin_draft`, `draft_invalid` |
| `editorial_review` | `editorial_failed`, `editorial_uncertain` (review unparseable, failed closed) |
| `verification` | `verification_failed`, `verification_uncertain` |
| `github` | `published` (branch created and article committed), `github_push_failed` (with `httpStatus`) |
| (none) | `unclassified`: investigate |

Image decisions on committed stories:

| `image.mode` | `image.reason` |
| --- | --- |
| `illustration` | `approved` |
| `text-led` | `image_rejected_style`, `image_rejected_safety`, or `image_no_candidate` |

Aggregate, live, video and gallery pages are screened out before the loop, so they appear as `queue.aggregatePages` rather than as per-candidate events.

**Privacy.** Telemetry holds only codes, counts, slugs, sections and source domains. It never includes source or article text, prompts, model output, full source URLs, error messages, headers or credentials. `tests/n8n-telemetry.test.mjs` enforces this against the exported node code.

**Fail-safe.** Both telemetry nodes run with `onError: continueRegularOutput` and catch their own errors (`reason: "telemetry_error"`). Run Summary runs only after the loop has finished, and neither node feeds any gate.

## Limits

- **Real photos** are chosen after the run by `visual-acquire.yml` on the incoming branch, so `imageModes.photo` is always 0 in n8n. The GitHub reporter above counts the final photo, illustration and text-led mix.
- **PR opening and merging** happen in GitHub Actions. n8n's `published` means its path completed: branch created and article committed. Open or held incoming PRs are reported by the GitHub reporter.
- **Stage timings:** n8n records per-node timings in each execution, but Code nodes cannot read them. The summary reports the total `durationMs` from queue to summary. For per-stage times, open the execution in n8n.
- **Hard failures:** a run that fails outright (for example a GitHub commit that fails after retries) stops before Run Summary and appears as a failed execution. A run with zero queued candidates never enters the loop, so it has no summary either.
- **Retention:** summaries last as long as n8n's execution retention on the plan.
