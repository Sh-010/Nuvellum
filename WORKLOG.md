# Nuvellum engineering worklog

Append new entries at the top. Record what changed, the commits, the tests with their results, blockers, and anything that needs the owner.

---

## 2026-09-30: Production redeploy trigger after editorial queue merge

- Editorial PRs #127–#133 and social-card publishing are merged into current `main`.
- Vercel skipped later main commits while the Hobby deployment-rate limit was active; this documentation-only commit intentionally triggers a fresh production deployment now that the limit has reset.
- No runtime code or configuration changed in this entry.

## 2026-09-30: Social cards wired into the publisher (`feat/social-card-publish`, stacked on #140)

**Fix before merge: manual runs can no longer fan out.** A `workflow_dispatch` with an empty slug used to fall back to the 48-hour scan, which once bulk-posted several stories in production.
- `runScope()` (engines/publish/run.mjs) decides what a run may touch:
  - a `schedule` trigger scans the window;
  - any other run needs `--slug`, unless `--bulk` is given explicitly.
- A missing trigger counts as manual. A refused run exits before creating the ledger folder, making network calls or reading anything; `--needs-cards` answers "no".
- The workflow passes `--trigger ${{ github.event_name }}` and gains a boolean `bulk` input (default false).
- Tests:
  - a scheduled run scans the window;
  - a manual slug run touches only that story;
  - a manual run with no slug and no bulk does nothing: no ledger folder, and a `::notice::` in Actions;
  - bulk works only when chosen;
  - the workflow wiring.

The card designs are unchanged; no platform other than Telegram was enabled; `NUVELLUM_X_BUDGET_APPROVED`, billing and permissions are untouched. At the start, the live ledger showed Telegram `sent` for all 8 recent stories. `NUVELLUM_SOCIAL` is `on`, so nothing here was run live.

- **`engines/publish/assets.mjs`:** renders the story's cards with #140's renderer, rasterises every card in Chromium, and refuses the set on any failure: a render error, a clipped headline, an overflow in Chromium, or a PNG that was not written. It also holds the platform→card contract: Telegram square; Facebook, LinkedIn and X landscape; Threads square; Instagram portrait; TikTok and YouTube story. Quote cards follow #140 (none for sensitive stories).
- **`engines/publish/run.mjs`** (per-story logic, extracted from the CLI so it can be tested):
  - Cards are rendered **once**, and only when a post to an image platform is actually due.
  - Telegram gets the verified square PNG.
  - A failed render holds the post (`queued`, `cardFailures`, error; `entry.cards` records it). After 2 failed renders it falls back to the previous deterministic post (photo by URL, or text), recorded as `cardFallback`.
  - The ledger is saved after every post; `sent`/`failed` stay final.
- **Telegram adapter:** multipart/form-data `sendPhoto` upload of the local card (`kind: "card"`), with the caption unchanged (bold headline, dek, tracked "Read on Nuvellum →"). The legacy path is unchanged when no card is given.
- **CLI:** `--needs-cards` (the workflow gate) and `--render` (a dry run that renders and verifies, and prints the exact Telegram upload and caption); `--slug` validated.
- **`social-publish.yml`:** the "Will this run post cards?" step installs and caches Chromium only when needed; no secrets are passed to the install step. The posting step is unchanged.
- **`social-distribution.yml`:** the engine tests also run on dispatch (so stacked branches can be checked), with real Chromium (`CARDS_CHROME=1`).
- **Tests:** `engines/tests/publish-cards.test.mjs` (10) and `tests/social-publish-workflow.test.mjs` (+1). They cover:
  - render before post, and the PNG existing when Telegram is called;
  - a text-led story getting a branded card;
  - no quote cards for sensitive stories;
  - sent entries neither re-rendered nor re-posted (no Chromium needed);
  - failed renders held, falling back after 2, and never posting twice;
  - overflow, clipping, crashes and missing browsers refused;
  - a Telegram 502 retried without duplication;
  - the multipart upload format;
  - manual `--slug` dispatch;
  - real Chromium PNGs at the exact sizes.
- **Safe dry run** (`--render`, fake token, `NUVELLUM_SOCIAL` unset) on the Apple story: cards rendered and verified in Chrome (square, landscape, portrait, story; no quote cards, since it is sensitive), with Telegram previewed as `sendPhoto upload=…/square.png` plus the caption. 0 ledger files written, no network post.

## 2026-09-30: Nuvellum social card system (`feat/social-card-system`)

Rebased onto main after #126 and #134–#139 merged. It changes none of them, nor the social credentials or adapters, newsroom logic, Admin or the site design. Documentation: `docs/SOCIAL_CARDS.md`.

- **Formats:** square 1080×1080, landscape 1200×630, portrait 1080×1350, and story 1080×1920 (content kept between y=250 and y=1600). Quote/key-fact cards come in square and portrait.
- **Templates:**
  - Standard;
  - Breaking/Developing, only from the article's own flag or tag;
  - Analysis/Opinion/Ideas: text-led, byline only for named people, quote ornament for opinion;
  - Culture/Cinema/Gaming: image-forward;
  - Quote/Key fact: verbatim, self-contained, never for sensitive stories.
- **Brand:**
  - the site's Newsreader font embedded in every card (so rendering is identical everywhere);
  - the site palette tokens;
  - the existing N✦ monogram and NUVELLUM✦ wordmark;
  - hairline rules and tracked labels;
  - no gradients.
- **Images:** only the story's own photo (FILE PHOTO chip plus licence credit) or approved illustration (ILLUSTRATION); otherwise text-led. Text never sits on a picture, and tall pictures are top-anchored so heads are kept.
- **Headline fitting:** Newsreader widths measured in Chromium; largest size within per-template bounds; balanced breaks; long-headline layout; photo cards shrink the picture, then switch to text-led below a legibility floor; clipping with "…" only as a flagged last resort.
- **Manifest v2:** assets with format, size, variant, image use, headline fit, safe zone and path, plus `media.usedBy`, the quote and the `clipped` flag. The v1 keys are kept, so `engines/distribution` still works (checked).
- **QA in real Chrome:** 68 cards (4 real stories plus 11 fixtures) rasterised at their exact sizes. Every text line was checked against its fitted box: 0 overflow.
- **Defects found and fixed during visual review:**
  - the landscape footer and site name ran over the photo;
  - the section label was hidden under the picture;
  - the opinion quote mark collided with the headline;
  - image-forward squares set the headline at 42px (the picture now shrinks first);
  - short headlines stopped at 96px (they now reach 118–150px);
  - a key-fact card picked a line with a dangling "such deals";
  - death-toll "key facts" on sensitive stories (such cards are now skipped).
- **Tests:** `engines/tests/cards-system.test.mjs` (17, including an opt-in Chromium test) plus updated `cards.test.mjs`. Engines suite: 36 (35 pass + the Chromium test, which also passes with `CARDS_CHROME=1`).
- **Review sheets:** `docs/social-cards/*.jpg`.
- **Story-cover polish** (1080×1920 only; safe zones unchanged). Everything was re-checked in Chrome at full size: 68 cards, 0 overflow.
  - The photo composition is centred between header and footer; the dead space above the footer has gone.
  - A burgundy-over-hairline masthead rule sits above y=250 (the breaking band fills that zone instead).
  - A large, faint N✦ monogram rises from the bottom edge below y=1600, its star clear of the footer labels. It is marked `data-decor`, and text-led covers carry this one monogram instead of a second.
  - The spine is 14 px.
  - The Story Opinion/Analysis layout now reserves room for the dek and byline, which previously crowded the footer rule.
  - New tests: all Story content between y=250 and y=1600 with only marked decoration outside it, and a centred photo composition. Sheet: `docs/social-cards/8-story-covers.jpg`.

## 2026-09-30: v1 launch programme, Phase 10: real-site QA sweep (production)

Against https://www.nuvellum.news at the time of writing: main = PR #125. PRs #126–#139 are unmerged, and each was QA'd on its own local build (see its entry).

- **Crawl:** all 81 sitemap URLs and all 97 distinct internal links found on them return 200.
  - One "404" was a crawler false positive: `'/article/'+encodeURIComponent(x.slug)` inside the homepage's search script, not a link.
  - Apex → www redirects with a 308.
- **Security headers on /:** HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy and X-Frame-Options, all present.
- **Chrome at 360 and 1440 px on 9 pages** (home, Latest, World Explorer, Section World, an article, About, Privacy, Advertise, and a 404):
  - status as expected (404 for the missing page);
  - 0 horizontal overflow, 0 broken images, 0 failed sub-requests, 0 console errors (except the expected document 404).
  - Load events at 535–2435 ms from this connection. The 2.4 s case was the desktop homepage's first load; this is not a lab performance measurement.
- **Phase 1 still verified live:** the manifest parses and all icons decode (earlier CDP check). A physical-phone install is still owed.
- Not possible here: real iOS/Android devices, and the Vercel previews (protected by Vercel sign-in). Their equivalents were the local production builds in Chrome.

## 2026-09-30: v1 launch programme, Phase 9: security and operations hardening

Branch `feat/security-ops` (stacked on `feat/monetisation-readiness`). Runbook: `docs/SECURITY_OPS.md`.

- **Credential inventory:** each credential's name, where it lives, scope, expiry and rotation steps, and what breaks if it lapses. Covers:
  - Vercel: the admin GitHub token, admin password and session secret, the Brief secret, Upstash and GA4;
  - n8n: "Nuvellum GitHub" and "Google Gemini";
  - GitHub Actions: the social secrets;
  - the automatic `GITHUB_TOKEN`.
- **Unused n8n credentials found:** WhatsApp (2), Wordpress, "Unnamed credential", "Header Auth account" 1 and 2. None is used by the production workflow; the exported workflow references only "Nuvellum GitHub" and "Google Gemini". They are listed for the owner to delete; not deleted here (irreversible, and possibly used elsewhere).
- **Token expiry warning:**
  - The admin GitHub client now records GitHub's `github-authentication-token-expiration` header, and the queue response carries `tokenExpiresAt`.
  - The desk shows a notice 14 days before expiry, and a stronger one once expired. An expired 90-day token would otherwise silently stop publishing.
  - Verified in Chrome: shown at 5 days and when expired, hidden at 40 days, no overflow at 360 px.
  - The page names no secret variable (the existing admin test caught a first draft that did).
- **Branch cleanup:**
  - The rules now live in `scripts/lib/branch-cleanup.mjs`, with a `scope` input: `incoming` (the default) or `all`.
  - It stays manual and dry-run unless `yes` is typed.
  - New keep rules: branches that are the **base of an open stacked PR** (#134–#139 depend on this), and `social-ledger`.
  - Read-only dry run (`all`), 92 branches: 61 would be deleted (merged, unchanged tip); 31 kept (11 open PRs, 10 closed unmerged, 9 with no PR, and main). **Nothing deleted.**
- **Tests:** `tests/security-ops.test.mjs` (3): the planner's keep and delete rules including stacked bases, dry-run-by-default wiring, and expiry-header capture plus the desk threshold. `npm test` 326/326; build passes.

## 2026-09-30: v1 launch programme, Phase 8: AdSense readiness, sponsorship model, media kit

Branch `feat/monetisation-readiness` (stacked on `feat/shorts-piper`). **Nothing monetised or enabled; no figures invented.** Full audit: `docs/MONETISATION.md`.

- **Technically ready:** HTTPS with one canonical host, mobile layouts, all trust pages (200), no dead ends (after #135), licensed images with credits.
- **Not content-ready (main risk):** 33 stories, median 293 words, 32 of them "News", almost all machine-drafted from other outlets' reporting. That is the classic "low value content" rejection, and Google's spam policies target scaled content without added value. Advice: several weeks of original and edited work before applying.
- **Blocker for ads to UK/EEA/CH readers:** a Google-certified TCF CMP (per Google's AdSense Help; TCF v2.3 after 28 Feb 2026). The Phase 4 GA notice is not one; AdSense's free Privacy & messaging CMP would be the route. The privacy page needs its advertising section at the same time.
- **Recommendations (owner decisions, changes to the approved design):** a "How this story was made" line on automated articles, and a named responsible editor.
- **Built, dormant:** `scripts/write-ads-txt.mjs` serves `/ads.txt` (with Google's certification ID) only when `NUVELLUM_ADSENSE_PUB_ID` holds a real `pub-` + 16-digit ID. `check:build` fails if ads.txt ships without one, or is wrong with one. Both cases verified.
- **Sponsorship model** (no prices): Brief sponsorship, section "Presented by", World Explorer credit, and labelled "Paid partner content", each with editorial-separation rules. No CPM or reach claims until 60–90 days of consented GA4 data exist.
- **Media kit groundwork:** `npm run media-kit` reports only repository facts (33 stories since 2026-09-25; the section, format and visual mix; median length). The audience field says "not yet measured", and a test fails if audience figures ever appear.
- **Tests:** `tests/monetisation.test.mjs` (2). `npm test` 323/323; build and `check:build` pass.

## 2026-09-30: v1 launch programme, Phase 7: Shorts with the free Piper voice

Branch `feat/shorts-piper` (stacked on `feat/social-publish`).

- **Existing engine confirmed against the brief:**
  - extractive, verbatim article sentences only (no paraphrase model);
  - a Piper → espeak → silent narration chain;
  - word-timed captions plus SRT;
  - visuals only from the story's own licensed photo (labelled FILE PHOTO), approved illustration, or typography. **No stock or generated footage.**
- **Piper in CI:** this machine has no ffmpeg or Python, and none was installed. Instead, `shorts-preview.yml` dispatch gains `voice` (piper by default, or espeak) and `full` inputs.
  - Piper and the public-domain-trained `en_GB-cori-high` voice are installed at run time and cached, never committed.
  - A verify step fails the run if narration fell back from the requested voice, the MP4 lacks an AAC track, or `captions.srt` is missing.
- **Real renders** (full 1080×1920, US deportations story, photo-led), run in sequence:

| Run | tts | Length | Result |
| --- | --- | --- | --- |
| 36645418033 | piper | 34.6 s, 1039 frames | Rendered. **Defect:** the hook opened "The UN panel noted that the United States has signed **such deals**…", which refers to context the viewer never heard. |
| 36645907964 | piper | 44.4 s | Back-reference penalty added; the hook became "According to the experts, **the practice**…", still dependent on context. |
| 36646197539 | piper | 44.6 s, 1338 frames | The lead now opens: "A panel of independent United Nations experts warned…". Then the risks, then non-refoulement, then the CTA. ✔ |

- **Frames checked in Chrome** (1 s to 33 s): the ivory ground, the Nuvellum masthead, the real photo labelled FILE PHOTO, large readable captions, and the burgundy end card with the headline and www.nuvellum.news.
- **Hook rule:** lines pointing back ("such", "these", "those"…) are penalised, and the article's self-contained lead is favoured up to 320 characters. Across all 33 published stories the lead now opens 30 shorts; the longest script is 40.9 s (limit 45).
- **Tests:** the engines suite 29/29 (plus a regression test: this story must open on its lead).
- **Posting stays manual.** YouTube stays `skipped` until a reviewed Short exists, and TikTok `awaiting_approval` (Phase 6 ledger).
- **Owner:** listen to a render before any public posting (Actions → Shorts preview → Run workflow, then the artifact). Choosing Piper Cori as the public voice is your call.

## 2026-09-30: v1 launch programme, Phase 6: social distribution (Telegram first)

Branch `feat/social-publish` (stacked on `content/unpublish-launch-filler`).

- **Found:**
  - Distribution was draft-only (copy plus cards as artifacts), with no posting and no outcome record.
  - The draft workflow fires on pushes to main, but auto-publish merges with `GITHUB_TOKEN`, and GitHub never triggers workflows from those pushes. So **automatically published stories never got drafts**.
  - The draft job built links on `nuvellum.vercel.app` (now www.nuvellum.news).
  - One engine test (`cards.test.mjs`) failed on main, because its story became text-led. It now uses a fixture.
- **Built:** `engines/publish/` (adapters, planner, CLI) and `.github/workflows/social-publish.yml`.
  - Runs on a schedule (:12/:42) and on dispatch.
  - Candidates are stories that reached main within 48h, plus queued ones; a story posts only after its page answers 200.
  - A separate workflow, so it cannot block or undo publishing.
  - **Telegram adapter** (Bot API): the headline in bold, the dek, the story's own raster photo, and a UTM-tracked "Read on Nuvellum" link. Text-led and SVG-art stories go as a message with a large link preview.
  - **Official-API adapters** for Facebook Page (Graph `/feed`), LinkedIn Page (Posts API) and X (v2 `/2/tweets`, OAuth 1.0a). They are dormant without credentials. X also needs `NUVELLUM_X_BUDGET_APPROVED=yes`, because it is paid (about $0.20 per linked post).
  - Instagram and Threads: `skipped` (no adapter). YouTube: video only. TikTok: `awaiting_approval`.
  - **Ledger** per story and platform (`queued`/`sent`/`failed`/`skipped`/`awaiting_approval`, with attempts, times, and the remote id/URL or error) on the `social-ledger` branch. That branch never deploys (vercel.json) and triggers no workflows.
    - `sent`/`failed` are final (no duplicate posts).
    - The ledger is written after every post and saved `if: always()`.
    - 429/5xx errors retry up to 3 attempts; other 4xx errors do not.
    - Errors are trimmed, and credentials redacted.
  - Master switch: repository variable `NUVELLUM_SOCIAL=on`. Without it, the job only prints its plan.
- **Tests:**
  - `engines/tests/publish.test.mjs` (9):
    - Telegram copy (escaping, the photo rule, the 1024-character caption limit; this caught a real overflow);
    - Bot API request and token redaction;
    - the Facebook and LinkedIn request formats (incl. LinkedIn reserved-character escaping);
    - the X OAuth 1.0a signature against X's documented reference example, and the `/2/tweets` request;
    - the planner (live/queued/skipped/awaiting), no duplicates, retries, and the X budget gate.
  - `tests/social-publish-workflow.test.mjs` (3): the schedule, the single-flight lock, no coupling to the gate, secrets only via env, the switch, and the ledger branch.
- **Results:** the engines suite is 28/28 (previously 26/27 on main). A dry run against the real repo and live site lists the 8 stories from the last 48h: Telegram "would post" when configured; the others are skipped with their reasons, and TikTok is awaiting approval.
- **Needs the owner (names only):**
  - Telegram: create a bot with @BotFather and the Nuvellum channel (the bot as admin).
    - Secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, in GitHub → Settings → Secrets and variables → Actions.
    - Variable `NUVELLUM_SOCIAL=on`.
  - Facebook, LinkedIn and X need the accounts, apps and reviews in `docs/SOCIAL_PLATFORM_SETUP.md`; X also needs the budget decision.

## 2026-09-30: v1 launch programme, Phase 5: content cleanup

Branch `content/unpublish-launch-filler` (stacked on `feat/ga4-search-console`). Every one of the 52 articles was audited: status, origin, risk, gate fields, word count, image mode, `newStoryQualityProblems`, and the homepage slot it fills.

| Class | Count | Items | Decision |
| --- | --- | --- | --- |
| **Unpublish** | 18 | ai-infrastructure, film-spectacle, industrial-race, megacity-power, power-distributed, supply-chains-foreign-policy, world-in-motion, global-anime, observatories, patient-capital, regional-power-logistics, smaller-studios, too-much-information, young-cities-investment, internet-flattened-taste, prestige-media, seriousness-fashionable, sports-media-war | All 18 "launch" pieces share one of **two identical boilerplate bodies** (95 or 158 words about Nuvellum itself), under headlines and labels promising 5–12 minute Analyses, Essays or News. That is placeholder filler presented as journalism. They are set to `status: "draft"` (reversible; history kept) and their image-credit entries are removed. Two of them filled homepage In Focus, and three were the only Opinion pieces. |
| **Keep** | 24 | automated stories with `editorialReview: "passed"` (and verification where sensitive) | Pre-contract stories lack World Desk `regions`/`countries` (22 stories across Keep rows), so they are not placed on the map. An optional backfill, not a defect. |
| **Keep (hand-reviewed before the gates existed)** | 8 | India–Pakistan UNGA, Iran/Hormuz, Mississippi (Tasia Fortune), Tigray, White House/CNN, OpenAI agents, Russia/Ukraine data centres, Scotland diesel | The 7 sensitive ones carry `reviewedBy: "Sam Shehab"` and two sources each. Scotland diesel is low risk. India–Pakistan's first source is a DW live page (now blocked by the quality rules); it stays because the owner reviewed it with a second source. Worth a re-read. |
| **Replace (fixed in place)** | 1 | fuel-costs-create-recruitment-hurdles-for-jersey-meal-delivery-service | Owner-reviewed and low risk. The Title Case headline is now sentence case, and the `?at_medium=RSS&at_campaign=rss` tracking parameters are stripped from its source URL. The slug and URL are unchanged. |
| **Keep as draft** | 1 | unity-of-being-and-the-multiverse… | The owner's manual draft; untouched. |
| Delete | 0 | — | Nothing is disposable enough to delete. The filler topics could return later as real reported features. |

- **No broken slots:**
  - Section fronts for every nav link (World … Opinion, Science, Anime, Crime) are always generated. When empty they show the existing "Nothing has been published in X yet" note and are `noindex`. /section/opinion and /section/science would otherwise have become 404s.
  - The sitemap lists only section fronts with reporting; the build fails on any `noindex`/sitemap disagreement (world, country, section).
  - A new build check fails if **any** built page links to an `/article/<slug>` that doesn't exist. Proven by injecting a link to an unpublished slug.
  - The v5.1 demo page `/article.html` (still deployed, and linking to world-in-motion) now 308-redirects to /latest.
- **Homepage defect fixed:**
  - With the filler gone, In Focus fell back to stories already in the supporting row ("Apple ordered to pay $5.7bn" appeared twice). The existing test even pinned that duplicate.
  - In Focus now prefers stories not already on top, and uses top stories only when the edition is too small.
  - The test was corrected, and a regression test added.
- **Results:**
  - `npm test` 318/318; `validate` and `security:audit` (0 vulnerabilities) pass.
  - Build: 33 published articles, and `check:build` passes.
  - Real Chrome at 1440 and 390 px:
    - every homepage block is filled from real stories;
    - no page errors, failed requests or broken images;
    - no overflow;
    - In Focus shows Swiss referendum, Forgotten Island cast and Grey's Anatomy, none of which repeat the top stories.

## 2026-09-30: v1 launch programme, Phase 4: GA4 and Search Console readiness

Branch `feat/ga4-search-console` (stacked on `feat/nuvellum-brief`, PR #126).

- **GA4 (still dormant until `NUVELLUM_GA4_ID` is set in Vercel):**
  - **Consent first.** Nothing from Google loads, and no cookie is set, until the reader chooses Allow in a small notice. "No thanks" is remembered. /privacy has "Change analytics settings". `NUVELLUM_ANALYTICS_CONSENT=implied` removes the notice (an owner/legal decision).
  - **Events.** One explicit `page_view` per page, with `page_type` (home/article/section/latest/world_explorer/world/country/author/page/not_found). The in-page classifier is generated from the tested `pageType()`.
    - `page_location` keeps only utm_* tags.
    - `sign_up` (`method: nuvellum_brief`) fires only when /api/brief confirms a sign-up; it replaces the old click-based `newsletter_interaction`.
    - Google signals and ad personalisation are off.
  - **Where.** Never on `/admin` or `/brief/*`; a double-initialisation guard.
  - **Bugs fixed:**
    - `instrument-analytics.mjs` used `URL.pathname` for `dist/`, which breaks on Windows. It now uses `fileURLToPath`.
    - The CSP lacked `*.analytics.google.com` (a GA4 collection host).
- **Search Console:**
  - Production is correct: www canonical, apex 308, robots.txt and RSS. `SITE_URL` is set in Vercel, so the note in the Phase 2 entry was corrected.
  - The sitemap now also lists `/world-explorer`, `/credits`, and the region and country desks that carry reporting (+24 URLs).
  - The 215 empty country and region desks are now `noindex`. `check-build-output` fails if a desk's `noindex` and sitemap listing ever disagree.
  - `docs/SEARCH_CONSOLE.md` covers the owner steps (domain property via a DNS TXT record, sitemap submission, URL inspection) and makes no indexing claims.
- **Tests:** 4 new analytics tests (consent-first, page types, UTM-only location, `sign_up` wiring, exclusions and CSP). `npm test` 317/317.
- **Builds:**
  - Default build: analytics disabled, `check:build` passes.
  - With a test ID (`G-QATEST123`): 358 files instrumented; admin and unsubscribe excluded; `check:build` passes with the analytics assertions.
- **Real Chrome** (Google requests intercepted and blocked):
  - The notice shows, with 0 Google requests and no dataLayer before a choice.
  - Allow → gtag.js is requested, and `page_view:home @/?utm_source=newsletter&utm_medium=email` is sent (the `secret=abc` query was dropped).
  - A Brief sign-up → exactly one `sign_up:home:nuvellum_brief`, with no "@" anywhere in the dataLayer.
  - The page types are correct on /latest, /world-explorer, /section/world and an article.
  - /admin and /brief/unsubscribe have no analytics.
  - At 360 px: the notice doesn't overflow the page. Declining persists across pages with 0 Google requests, and /privacy settings reopens the notice.
- **Needs the owner:**
  - `NUVELLUM_GA4_ID`: from Google Analytics → Admin → Data streams (Web, https://www.nuvellum.news). Place it in Vercel → Settings → Environment Variables (Production), then redeploy.
  - Search Console: add the domain property `nuvellum.news` (a DNS TXT record at the DNS host) and submit the sitemap. Both need a Google sign-in.

## 2026-09-30: v1 launch programme, Phase 3: n8n v6.5 newsroom audit, three consecutive clean real runs

Live workflow `8hXx6NuZuJU9dRR1` at version **f67dcee5**, unchanged in this phase. The repo export `n8n/workflows/nuvellum-newsroom.json` matches it (same versionId, 67 nodes), so the backup is current. The workflow stayed inactive with the schedule off and `NUVELLUM_AUTOPUBLISH` = `off` (checked via API). Before starting there were no open editorial PRs.

- **Gates audited in `scripts/lib/editorial.mjs` (the auto-publish eligibility check):**
  - Every automated story needs `origin: automation`, `status: published` and `editorialReview: "passed"`.
  - Low risk: `verification`, if present, must be `cleared`.
  - Sensitive: `verification: "cleared"` **and** `reviewedBy: "Nuvellum Verification Pipeline"`.
  - Opinion and review formats are refused, only the article plus its own art or photo may change, and the required checks must pass on the exact commit.
  - n8n cannot mark an uncleared story published (`scripts/lib/newsroom.mjs`).
- **Runs** (manual executions, one at a time). Each summary comes from the Run Summary node; each PR was checked via the GitHub API for branch, PR count, frontmatter gate fields and push checks.

| Run | Execution | Candidates | Stopped (fail-closed) | Committed | PRs | Gates | Push checks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 946 (1m31s) | 5, 0 unaccounted | CNBC thin source; France 24 thin draft | 3 low | #127 Polygon, #128 NASA, #129 Deadline | low + `editorialReview: passed` | 6/6 green each |
| 2 | 947 (45s) | 5, 0 unaccounted | CNBC thin source; Polygon, NASA and Deadline as exact duplicates of open PRs | 1 sensitive | #130 BBC Cornell case | `passed` + `cleared` + pipeline reviewer | 6/6 green |
| 3 | 948 (1m29s) | 5, 0 unaccounted | ANN thin source; Polygon failed editorial review | 2 low + 1 sensitive | #131 Deadline, #132 BBC Sport, #133 France 24 AI accord | as above | 6/6 green each |

  - No node errors in any run. Exactly one PR per branch (the #81 concurrency fix holds). Nothing merged.
  - Run 3's third PR opened about 10 minutes late: Auto-open was queued behind CodeQL jobs for three simultaneous branches (the free-plan runner limit), not a failure.
  - On #130 the Visual Engine found no licensed photo and removed the AI illustration, leaving the story text-led. That is the designed policy for news stories (`scripts/visual/acquire.mjs`); the n8n run summary still says "illustration" because that is decided later in Actions (a known limit, docs/OBSERVABILITY.md).
- **Editorial follow-ups (not pipeline failures; all PRs are held for the editor):**
  - The headline casing heuristic (`sentenceCase` in Parse Draft & Build Markdown):
    - treats a word after a leading digit as mid-sentence ("8 Games with magic systems…", #127);
    - can split a compound title ("CinemaCon managing Director", #129).
  - "Nasa" comes from the drafter (BBC style).
  - #127 is a listicle ("8 games…") that passed editorial review. Consider whether list features belong in automation.
  - #133 is tagged `["United States","China"]`. Check China is material to the story.
  - The editor should review #127–#133 in /admin before any publish.
- **Result:** 3/3 consecutive clean real runs (946, 947, 948). No workflow change was needed. The editorial items above are for the owner's review queue.

---

## 2026-09-30: v1 launch programme, Phase 2: the Nuvellum Brief as a real subscription

Branch `feat/nuvellum-brief`. Phase 1 merged as PR #125 and is verified live: Chrome on www.nuvellum.news parses the manifest, all four icons decode, and the Apple icon and theme colour are correct. A physical-phone home-screen install is still owed by the owner.

- **Storage:** Upstash Redis (free plan, via Vercel Marketplace), spoken to over its REST API with no SDK (`scripts/lib/brief/store.mjs`). Nothing is stored in GitHub, public JSON, static files or browser storage. Until `NUVELLUM_BRIEF_SECRET` and `KV_REST_API_URL`/`KV_REST_API_TOKEN` are set, the endpoint answers 503 "not open for sign-ups yet" and stores nothing. It is therefore safe to deploy first.
- **Public endpoint** `api/brief.js` (`scripts/lib/brief/{brief,handler}.mjs`):
  - Sign-up requires same-origin JSON.
  - Addresses are normalised (trim, lower-case, IDNA) and strictly validated.
  - Explicit consent is required and recorded with its time and wording version.
  - Honeypot plus a 2.5 s minimum fill time.
  - Rate limits: 5 per client per 10 min and 300 per hour overall, keyed by an expiring HMAC of the IP; no IP is stored.
  - Duplicate sign-ups create no second record. Unsubscribed readers are reactivated.
  - The response is identical in every case, so the form cannot reveal who subscribes.
- **Unsubscribe:**
  - Links carry an opaque HMAC subscriber key plus a separate signed token, never the address. Forged and cross-subscriber tokens are refused, and repeating an unsubscribe is harmless.
  - `/brief/unsubscribe` confirms with one button (nothing happens on load, because mail scanners follow links), then removes the signed link from the address bar. It is noindex, has no canonical and is not in the sitemap. It serves `Referrer-Policy: no-referrer` and `no-store`.
  - RFC 8058 one-click unsubscribe is supported for email headers.
- **Admin:** a new **Brief** tab in /admin shows active/unsubscribed/total counts, the signup date, status and source, plus search and a status filter. It also offers a manual unsubscribe (with confirmation) and a CSV export of active subscribers with consent data and personal unsubscribe URLs. Formula-injection-safe cells.
  - The data is served only by `/api/admin` behind the existing session, CSRF and origin checks.
  - With a fourth tab, the desk bar overflowed at 320, 390, 414 and 641–768 px. Tab spacing was tightened at ≤460 and ≤340 px, and long labels are hidden at 641–860 px. The bar now fits at every width from 320 to 1280, measured in Chrome.
- **Front page:**
  - consent checkbox (with a link to /privacy), hidden honeypot;
  - POST to `/api/brief`, with success/error states and a disabled button in flight;
  - form reset on success. The address is never stored in the browser.
- **Privacy page:** documents what is stored, where, the hashed rate-limit key, unsubscribe/erasure, and that the sending provider will be named before the first issue.
- **Docs:** `docs/BRIEF.md` covers setup (env names only), the rules, the data layout, erasure, and campaign providers with their reported free tiers (Kit, Brevo, MailerLite, Buttondown, listmonk; marked "verify"). It recommends Kit's free plan. `.env.example` lists the three names.
- **Tests:** `tests/brief.test.mjs` (14 tests):
  - valid sign-up, malformed email, duplicate, unsubscribe, repeated unsubscribe, resubscribe;
  - rate limits (per client, window reset, global ceiling);
  - unauthorised access (admin brief actions without a session → 401, without CSRF → 403, cross-origin sign-up → 403, forged tokens → 403, list/export absent from the public endpoint → 404);
  - not-configured 503 and the admin "not connected" state;
  - honeypot, too-fast and no-consent submissions;
  - RFC 8058 one-click unsubscribe, no address in links, CSV escaping;
  - the Upstash request format, and store errors not echoing credentials.

  `check-build-output` now also checks the consent form, the honeypot, the unsubscribe page's noindex and its absence from the sitemap.
- **Results:**
  - `npm test` 313/313; `validate`, `build` (358 pages), `check:build` and `security:audit` (0 vulnerabilities) all pass.
  - Real Chrome against the built site, with the real handlers and an in-memory store, at 1440 and 360 px:
    - missing consent → prompt;
    - invalid address → prompt;
    - valid sign-up → thank-you, with the form reset and nothing in localStorage;
    - duplicate → the identical thank-you;
    - admin list, search, CSV download (2 rows) and manual unsubscribe (counts 1/1/2);
    - the unsubscribe page with no link, a forged link (refused), and a valid link (unsubscribed, query removed);
    - no horizontal overflow.
- **Needs the owner** (names only, never paste values in chat):
  - `KV_REST_API_URL` and `KV_REST_API_TOKEN`: from Vercel → Storage/Marketplace → Upstash for Redis (free), connected to the project. Vercel adds them.
  - `NUVELLUM_BRIEF_SECRET`: 32+ random characters, placed in Vercel → Settings → Environment Variables (Production). Keep it stable.
  - Redeploy afterwards.
  - Choosing a sending provider is a later decision; no email is sent yet.
- **Noted for Phase 4:**
  - Production sets `SITE_URL`, so the live canonical, sitemap and RSS URLs use `https://www.nuvellum.news` (checked). The `nuvellum.vercel.app` fallbacks only apply to builds without it.
  - When GA4 is enabled it must not run on `/brief/unsubscribe` (signed query) or `/admin`.

---

## 2026-09-30: v1 launch programme, Phase 1: mobile/PWA branding

Branch `fix/pwa-icons`.

- **What was actually wrong** (verified in Chrome and by decoding the PNGs):
  - `public/icon-512.png` was truncated ("truncated IDAT chunk"): only the top strip rendered. It was used for both the regular and the maskable icon.
  - `icon-192.png` had a corrupt data checksum ("bad CRC in IDAT"), and its bottom rows were missing.
  - The homepage never linked `manifest.webmanifest`. Chrome on the live site reports `no-manifest`, so installing from the homepage produced generic artwork.
  - The homepage `theme-color` was `#6d1026`, while every other page and the manifest use `#6d1720`.
  - The existing test only checked the 8-byte PNG signature.
- **Fix:**
  - The icons are rendered from `public/favicon.svg` (the approved N + crimson-star tile, per PRs #90 and #115–#118) by a dependency-free rasteriser (`scripts/lib/app-icons.mjs`, `node scripts/build-app-icons.mjs`). The favicon and the header logo are unchanged.
  - Variants:
    - `any` 192/512: the favicon exactly.
    - Apple 180: full-bleed and opaque, with the monogram at 80 % so iOS corner rounding cannot clip the star.
    - Maskable 192/512: full-bleed and opaque, with the monogram at 66 %, entirely inside the W3C 80 % safe circle.
  - New versioned paths under `/icons/` replace `?v=1`. The legacy `icon-*.png` files are re-rendered with the same artwork for cached shortcuts.
  - The manifest gains `id`, `scope`, `lang` and separate maskable icons.
  - Every page (SiteHead, homepage renderer, v5.1 bridge) links the manifest, the new Apple icon and `apple-mobile-web-app-title`, with one theme colour.
- **Tests:** `tests/mobile-pwa.test.mjs` now fails on:
  - a truncated or corrupt icon, or a size that doesn't match the manifest;
  - a stale `?v=1`;
  - icons that no longer match the favicon pixel for pixel;
  - transparent home-screen icons;
  - a maskable monogram outside the safe circle;
  - a missing manifest link, Apple icon or title on any page;
  - a theme colour mismatch.

  `check-build-output` decodes every manifest icon in `dist/` and fails on the old broken file (verified).
- **Results:**
  - `npm test` 299/299; `validate`, `build` (357 pages), `check:build` and `security:audit` (0 vulnerabilities) all pass.
  - Chrome on the local build: the manifest parses, all four icons decode, and the only installability note is `in-incognito` (the automated session). The live site before the fix reports `no-manifest`.

---

## 2026-09-30: write-first editor pass (PR #121)

No change to auth, GitHub flow, schema, gates or the newsroom. One additive, read-only field was added: the `check` response now carries `draftBlockers`, the problems that would stop even a draft from saving (the same list `save()` already used).

- **Quiet while writing, strict on publish:**
  - While drafting, only duplicates and draft-blocking problems (for example raw HTML or an unsafe link) are marked. Tab counts are hidden, and the readiness pill reads "N to do" in amber.
  - Submit for review, Prepare publication and Publish switch to strict. The Checks panel opens with a "N things to fix" list of plain, clickable sentences, fields are marked, and tabs are counted. Each item clears as soon as it is fixed.
  - The requirements themselves are unchanged. Save draft still accepts incomplete stories.
- **Web address:**
  - It is made from the headline, kept distinct from known articles and desk drafts, and shown as `nuvellum.news/article/…` under Story → Advanced.
  - Hand edits are tidied into a valid address when the field is left; clearing the field hands it back to the headline.
  - Locked once the story is saved, as before.
- **Duplicates:**
  - A calm "This story already exists." notice under the headline, with "Open existing article" (after confirming if there are unsaved changes) and "Create as a different story". The latter keeps the draft, gives it its own address and selects the headline to be rewritten.
  - A saved story shows "Another story already has this headline" and never flags itself (tested).
  - The server still refuses to save a new story over an existing one.
- **Local recovery:**
  - Unsaved writing is kept in this browser (localStorage) 0.7 s after each change: the story's fields only, never session data or files, for at most 7 days. It is cleared after a successful save and on log out.
  - After a reload the editor offers "Restore it" or "Discard". The command bar shows Saving… / Saved on this device / Saved just now.
  - No GitHub calls are made for recovery.
- **Command bar:**
  - Every action has a tooltip saying what it does.
  - The status texts have fixed widths, so buttons never move under the finger. This fixed a real missed tap on tablets.
- **QA:**
  - Write-first scenarios 37/37 at 1440, 820 (touch), 390 (touch) and 360 (touch).
  - Redesign suite 45/45 at 1920, 1280 (dark), 820 (touch, dark) and 360 (touch).
  - Toolbar and scroll preservation 70/70 at 1440 and 390.
  - `npm test` 294/294; `validate`, `build`, `check:build` and `security:audit` all pass.

---

## 2026-09-29 (night): Editorial Desk UX redesign (PR #121)

Frontend only (`src/pages/admin.astro`). Auth, the API, GitHub, gates, schema, validation, n8n and the public site are unchanged.

- **Shell and Articles:**
  - The masthead is one 56 px line: brand, tabs, date, day/night switch and an account menu.
  - Articles is an archive of compact rows: a thumbnail only for a story's own picture, headline, section · type · byline, date, and state/risk/origin chips. Drafts in progress sit above the list.
  - The Queue is kept, with only its spacing aligned.
- **Editor:**
  - A persistent command bar: back, headline, state, save status, a readiness pill, Write / Side by side / Preview, and the publishing actions. Hold, send back, reject, discard and unpublish sit in a separate More menu.
  - A writing canvas: large headline, a standfirst tied to it by a crimson rule, a borderless 20 px body, and the sticky grouped toolbar (behaviour unchanged).
  - A tabbed Inspector (Story, Media, Editorial, Checks) with per-tab issue counts. Secondary fields are folded; verification only appears for Sensitive stories.
  - Images: text-led, current, upload (choose or drop) or address, with preview, Replace and Remove; alt text, caption and credit beside the image; licensing folded.
  - The Checks tab shows a readiness checklist over the translated blockers, with warnings apart and GitHub details folded.
  - Clicking an issue opens its tab and focuses the field without moving the article.
- **Responsive:**
  - Side by side from 1200 px.
  - The Inspector docks from 1680 px beside Side by side (and at 1100 px and up in Write and Preview), and is otherwise a slide-in drawer. The closed drawer is clipped, not moved off-screen, which previously widened the page on phones.
  - The command bar wraps below 1100 px, and its measured height positions the sticky toolbar.
- **QA:**
  - Browser QA of the redesigned flow at 1920, 1440, 1280, 820 (touch), 390 (touch) and 360 (touch), in light and dark: 44/44 each.
  - Toolbar and scroll preservation 70/70 at 1440, 820 and 390.
  - `npm test` 290/290; `validate`, `build`, `check:build` and `security:audit` all pass.

---

## 2026-09-29 (evening): Editorial Desk integration pass (PR #121)

- **Homepage and manual stories.** Traced after the first real manual publication (#123, a Science essay).
  - The production homepage is rendered by `scripts/render-editorial-home.mjs`, which already took every published story, whatever its origin.
  - #123 is live on the homepage as the first card under the hero. It isn't the hero because the hero is the newest *World* story, and it isn't in Latest because Latest deliberately skips stories already shown above.
  - The `origin === "automation"` filter was in `scripts/inject-home-content.mjs`, the older v5.1 slot filler, which is not part of `npm run build`. It is fixed anyway: all origins, and manual images are the story's own image or none, never generated art or an empty `<img>`.
  - Placement rules moved unchanged into `scripts/lib/home-selection.mjs` so they can be tested. The built homepage is byte-identical except the build-time "n hours ago" labels.
  - `check-build-output` now also fails on an empty or undefined `<img src>` on the homepage, and when the newest story of any origin among the four newest is missing from the homepage.
  - Docs corrected.
- **Validation wording.** `src/lib/admin-messages.js` translates every validator, gate and image message into editorial language and names its field and group. The rules are unchanged.
  - In the editor, blockers are listed under "Must fix before publishing" and mark their field and group, opening the group if it is collapsed. Clicking one scrolls to the field and focuses it, and the mark clears as soon as the field is edited.
  - Warnings, such as "No image: the story will be set text-led", sit apart under "won't block" and never mark, open or block anything.
- **Tests:**
  - `npm test` 290/290 (new: `home-selection`, `admin-messages`); `validate`, `build`, `check:build` and `security:audit` all pass.
  - Browser QA: editor flow 31/31 at 1440 px, 820 px (touch) and 390 px (touch); toolbar and scroll preservation 70/70 at each of the three sizes; end-to-end draft → PR → checks → publish; layouts and dark mode.
  - The built homepage was inspected with temporary manual fixtures: a manual World story took the hero (text-led), a manual photo story took a card under the hero with its own image, and a manual story reached Latest. The fixtures were removed afterwards.

---

## 2026-09-29: Admin dashboard and Editorial Review Queue (`/admin`)

Branch `feat/admin-dashboard`, PR open and **not merged**. Operator guide: `docs/ADMIN.md`.

- **Architecture**
  - `/admin` is a static Astro page: noindex, not linked, excluded from the sitemap, disallowed in robots, no analytics.
  - The API is one Vercel Function, `api/admin.js` (`/api/admin?action=…`). The rest of the site stays static.
  - Stories are still Markdown in Git; there is no database.
  - Every write goes through a branch and a PR, is merged only when the required checks pass on the exact head, and then deploys through Vercel.
- **Shared contract**
  - The validator's rules were moved verbatim into `scripts/lib/article-rules.mjs`. `validate-content.mjs` and the dashboard both use it.
  - On the clean repository and 40 of 41 mutation cases the output is identical to before. The one difference is the first new rule below.
  - New rule for all articles: links must be `http(s)`, `mailto:`, site-relative or `#`.
  - New rule for `origin: "manual"`: `risk` is required. Publishing needs `editorialReview: passed`; sensitive stories also need `verification: cleared` and a named `reviewedBy`. `Nuvellum Verification Pipeline` is reserved.
- **Branches**
  - Manual stories use `manual/<slug>-<yyyymmddhhmmss>`. They never touch `incoming/**`, so auto-open, visual-acquire and auto-publish are unaffected. Vercel branch deploys are disabled for `manual/**`.
  - Newsroom stories are reviewed and edited on their own `incoming/**` PR.
- **Review Queue**
  - Five columns: Pending Review, Checks Running, Ready to Publish, Published, Held / Rejected.
  - Actions: approve, clear verification, hold/release, send back, reject, and publish once green.
  - Held stories use the existing hold labels, which auto-publish already honours.
- **Proven compatibility fixes**
  - `visual-acquire.yml` skips commits whose message starts with `editor: `, so it no longer overwrites an editor's image or text-led decision.
  - `article/[slug].astro` no longer shows "Illustrative launch image" for manual images; image-rights details show only the recorded fields. All 358 existing pages are byte-identical to main.
  - `instrument-analytics.mjs` skips `/admin`.
- **Files**
  - New:
    - `api/admin.js`
    - `scripts/lib/article-rules.mjs`
    - `scripts/lib/admin/{auth,github,editor,images,render,handler}.mjs`
    - `src/pages/admin.astro`
    - `tests/admin-fixtures.mjs`
    - `tests/admin.test.mjs`
    - `docs/ADMIN.md`
  - Changed:
    - `scripts/validate-content.mjs`
    - `scripts/check-build-output.mjs` (admin noindex, no analytics or credentials, sitemap, robots)
    - `src/pages/robots.txt.ts`
    - `vercel.json`
    - `.github/workflows/visual-acquire.yml`
    - `scripts/instrument-analytics.mjs`
    - `src/pages/article/[slug].astro`
    - `.env.example`
    - `README.md`
- **New Vercel env vars** (values are never in the repo):
  - `NUVELLUM_ADMIN_PASSWORD` (at least 16 characters)
  - `NUVELLUM_ADMIN_SESSION_SECRET` (at least 32 characters)
  - `NUVELLUM_GITHUB_TOKEN`: fine-grained, `Sh-010/Nuvellum` only, with Contents RW, Pull requests RW, Actions R and Metadata R
- **Tests**
  - `npm test`: 247/247 (34 new admin tests).
  - CodeQL (first run) flagged two issues in the new code, both fixed in the PR rather than dismissed: the password comparison now uses scrypt instead of SHA-256, and heading-id tag stripping repeats until stable. After the fix, every PR check is green.
  - `npm run validate`: pass. `npm run build`: 357 pages. `check-build-output`: pass. `npm audit`: 0 vulnerabilities.
  - Local HTTPS browser end-to-end run in Chrome against an in-memory GitHub loaded with the real articles:
    - login (wrong, then right)
    - approve and clear a newsroom story
    - list and filter articles
    - a new story with an uploaded image: draft → PR → green → publish
    - mobile layout: no horizontal overflow; no JS errors
- **Limitations / owner actions**
  - Set the three env vars in Vercel, then do a first real run (a draft, then publish a low-risk test story, then unpublish it). The Vercel Function has only been exercised locally.
  - The login throttle is per function instance. Sessions are stateless: to revoke all of them, rotate the secret.
  - The preview uses a strict Markdown subset renderer that matches the house article layout; it is not the Astro build itself.
  - If `NUVELLUM_AUTOPUBLISH` is turned on, auto-publish can still merge pipeline-cleared newsroom stories that are not held.

---

## 2026-09-28 (night): n8n execution telemetry, the last step of the observability phase

- Live workflow `8hXx6NuZuJU9dRR1`, edited in place: 51c01d9f → **f67dcee5**. Still inactive; `NUVELLUM_AUTOPUBLISH` is still `off`. The graph has 67 nodes (+2); no gate, condition or decision node changed.
  - **Queue Latest Candidates**: adds a `_queuedAt` stamp and feed-screening counts (`feedItems`, `feedErrors`, `aggregatePages`, `repeats`). The selection is proven identical.
  - **Record GitHub Outcome** (new Code node): sits between the GitHub results (article commit; branch-creation error output) and the loop. It swaps the discarded API response for whitelisted fields: slug, section, risk, host, branch/commit status, HTTP status and the image decision.
  - **Run Summary** (new Code node): reads the loop's "done" output and emits one `run_summary` with counts, fixed reason codes, image modes, duration and compact per-candidate events.
  - Both new nodes are `continueRegularOutput` and catch their own errors.
- **Smoke test, execution 939 (manual, success, 10m43s):**
  - 1318 feed items were screened: 80 aggregate/live pages, 24 repeats, 1 feed error.
  - 5 candidates, all accounted for:
    - BBC Sport roundup: `draft_skip`
    - CNBC (23 words): `thin_source`
    - Polygon Pokémon TCG: published, **text-led**, `image_rejected_style` (UI panels)
    - Deadline Diablo Cody and Al Jazeera Apple patent case: sensitive, verified, published with **approved illustrations**
  - Every code matches the raw node outputs.
  - A privacy scan compared 420 windows of the run's source and article text against the telemetry: the only match is the public slug. No URLs, tokens or error text.
- **Publishing unchanged:** three incoming branches were created and PRs #100–102 opened automatically; the publish gate holds them (autopublish off). The photo pass found no photo for #100, so it stays text-led.
- **Found by the smoke test:** a regression from #98. The backfill test counts gated AI illustrations as weak art, so Build Nuvellum fails on #101 and #102. The fix is **PR #103**, a separate branch (204/204 tests and the build pass with the #102 story added). #101 and #102 need an update-branch after #103 merges.
- Repo: the sanitized export is synced, `tests/n8n-telemetry.test.mjs` is new (6 tests; the node code runs on fixtures; wiring, reason codes, image decisions, summary and leak checks), and `docs/OBSERVABILITY.md` and `n8n/README.md` are updated.
- **Limits** (details in docs/OBSERVABILITY.md):
  - Real-photo choice and PR open/merge happen in GitHub Actions, so n8n's `imageModes.photo` is always 0 and `published` means branch plus commit.
  - Per-stage timings stay in n8n's execution view.
  - Runs that fail outright, or queue zero candidates, produce no summary.

## 2026-09-28 (late night): text-led fallback replaces house plates (PR #98, not merged)

- Owner review: generic house plates were being used as hero and card images for stories they don't depict. Withdrawn: the plates, `scripts/visual/house-visuals.mjs`, and their plan and credit entries were removed.
- Policy: (1) a real, relevant photo first; (2) a story-specific generated SVG only if it passes the style gate; (3) otherwise no image, and the story is set text-led.
- Data: `image`/`imageAlt` are optional. `src/lib/story-image.js` treats `/images/<section>.svg`, `/uploads/house/` and procedural `/generated/<slug>.svg` as "no image"; procedural art is no longer substituted. The validator requires `imageAlt` whenever `image` is set and rejects house art.
- Text-led layouts, in the v5.1 tokens (paper, wine rule, serif, italic standfirst, a single ✦ mark), in both themes and at mobile width:
  - homepage: hero, support card, Latest row, World Desk row, In Focus lead and mini, Screen & Play lead and side item;
  - interior: desk lead, sparse-desk wide lead, section-front lead (headline left, standfirst and meta right), secondary item, continuing-feed row and A–Z entry;
  - article opening (an ✦ ornament instead of a picture), World Explorer panel rows.
- Share metadata: no og:image and `twitter:card=summary` for text-led stories. The homepage share image is the newest real photo.
- Now text-led: the Pokémon Winds and Waves leaks, Grey's Anatomy season 23 casting, and Melissa Barrera. The other six stories from the pass keep their real photos.
- Live n8n **51c01d9f** (from 5574f940, still inactive): Sanitize Editorial SVG's fallback removes `image`/`imageAlt` (`imageGenerationMode: text-led`), and the prompt says a rejected image means no image. Only these two nodes changed; the export is synced.
- Guards: `check-build-output` fails if generic art is rendered as an `<img>` on the homepage or any article; the contract tests cover neon art and empty responses resolving to text-led.

## 2026-09-28 (night): image-quality correction pass

- New rule: low-quality AI hero images are no longer acceptable. All nine articles still carrying generated `/generated/ai/` art (neon, hologram, HUD, particles) were replaced. Six now use real Commons photos: Anthropic/Amodei, Dave Franco, BalticServers data centre, Koshi river in Nepal, Elon Musk, and the Palais des Nations. Three use Nuvellum house plates: Pokémon (gaming), and Grey's Anatomy and Melissa Barrera (film-tv). All 21 unreferenced AI SVGs were deleted. The audit now shows 42 real, 3 house, 3 opinion illustrations and 0 weak.
- House plates: `public/uploads/house/<section>.svg`, drawn by `scripts/visual/house-visuals.mjs` (paper, ink, burgundy engraving motifs).
- Live n8n 8hXx6NuZuJU9dRR1 went from f8f72515 to **5574f940**, still inactive:
  - `Gemini Editorial SVG` prompt rewritten to the house style, with the hard rejects from #95.
  - `Sanitize Editorial SVG` gained `styleProblems()`, and every failure now falls back to the house plate (`imageGenerationMode: house-fallback`).
  - No other nodes or connections changed. The sanitized export is synced.
- Repo policy:
  - `hasRealVisual` ignores house plates.
  - Abstract news and analysis try a real photo first; only opinion, essay and ideas stay illustration-first.
  - The backfill audit counts `ai-svg` as weak.
- `NUVELLUM_AUTOPUBLISH` is still `off`.

## 2026-09-26 (evening): pushed, draft PRs opened, CI verified on GitHub

- GitHub write access became available. Pushed `checkpoint/pre-stabilization-2026-09-26` (= `main` @ `c14b931`), `fix/ai-image-validation` and `stabilize/newsroom`. The git proxy refuses tag pushes, so the checkpoint exists as a branch only.
- Draft PRs: #30 (`fix/ai-image-validation`) and #31 (`stabilize/newsroom`). Nothing merged.
- CI on GitHub:
  - #30: Build, Security checks, CodeQL all success; Vercel preview success.
  - #31: Build, Security checks, CodeQL, Engines tests all success, including the MP4 render on the GitHub runner; Vercel preview success.
  - CodeQL reported "No new alerts in code changed by this pull request" on both.
- Only annotations: GitHub platform deprecations (Node 20 actions; CodeQL Action v3, deprecated December 2026). The Dependabot branches for checkout/setup-node are already open. Bump `github/codeql-action` to v4 before December.
- Still owner decisions: merge order (#30 then #31, or #31 alone), closing #27 and #28, and keeping `NUVELLUM_AUTOPUBLISH` unset until n8n emits the new metadata.

## 2026-09-26 — Stabilization sprint (Claude, cloud session)

### Environment and blockers
- This session ran in a cloud container. Pushing to `Sh-010/Nuvellum` returned **HTTP 403** on every attempt: the Claude GitHub App is not installed with write access to the repo, and there's no local Git credential manager in the cloud. **Nothing was pushed, no PRs were opened, and nothing was merged.** All work is committed locally on `stabilize/newsroom` and `fix/ai-image-validation` and delivered as a git bundle and patch.
- Read access worked. All the GitHub findings below come from the live API.
- No n8n connection (MCP or API) was available, so Phase 4 (live workflow stabilization and three consecutive end-to-end runs) could not be done. Instructions are in `n8n/README.md`.

### Checkpoint
- Tag `checkpoint-pre-stabilization-2026-09-26` and branch `checkpoint/pre-stabilization-2026-09-26` point at `main` `c14b931`. Both are included in the bundle.

### Live GitHub evidence (read-only)
- PRs #28 and #29 were opened by `github-actions[bot]`. Their Build, Security, CodeQL and duplicate-guard runs exist but are **`action_required`** (never executed). #26 had real checks only because Sam opened it by hand.
- n8n's pushes appear as actor `Sh-010`, so `push` workflows do run normally.
- `GET git/matching-refs/heads/incoming/` returns 400 with the trailing slash; the duplicate guard was fixed before it ever ran.
- The auto-open workflow failed on #26 with the "already exists" race; it now treats that as success.
- A dry-run gate evaluation of the live PRs holds #26, #28 and #29. Reasons: `docs/RECONCILIATION-2026-09-26.md`.
- Root cause of the EU/Olympics mash-up in #28: the source was a DW **live blog**. Live blogs are now rejected.
- **18 of the 27 published articles are placeholders** sharing two bodies. Left untouched (no rewrites); the owner decides.

### Commits (`stabilize/newsroom`, oldest first)
| Commit | Summary |
| --- | --- |
| `0ce89c9` | Strict `/generated/ai/<slug>.svg` validation and allowlist SVG safety validator (also alone on `fix/ai-image-validation`) |
| `9d8a854` | Build stages into gitignored `.build/public`; `package-lock.json`; `npm ci`; CI fails if a build dirties the tree |
| `c240632` | Article Save button saves the current story and its URL; homepage resolves saved automated stories |
| `0bc4540` | Checks run on `push` to `incoming/**`; duplicate guard rewritten to work without a PR |
| `6e55245` | Publication gate (`auto-publish.yml`, `scripts/lib/editorial.mjs`) with explicit clearance and a kill switch |
| `94859be` | `n8n/` area, export sanitizer, CI secret scan |
| `1e6ea25` | Policy docs and schema |
| `c640f9a` | Fixes from live data (`action_required`, matching-refs, 422 race), quality gate, shared newsroom helpers, `publishedAt` ordering, merged-branch cleanup tool |
| `a8e3e2d` | n8n prompts (editorial review, 10-criterion sensitive verification, drafting, SVG) and CI-tested Code-node snippets; `buildArticle` |
| `42afaa7` | `engines/`: multi-model providers, grounding, Distribution Engine (6 adapters, ledger, retries) |
| `185ef9e` | Shorts Engine (script, verification, TTS chain, deterministic 9:16 renderer); `engines.yml`, `distribution.yml` |
| `74bc782` | AGENTS.md, CLAUDE.md, ARCHITECTURE, ENGINES, RECOVERY, RECONCILIATION, `.env.example`; API-outage tests |

### Tests and results (final run from a clean clone of `stabilize/newsroom`)
- `npm test`: **128/128 pass**. Covers the validator, SVG safety (real and malicious fixtures), the publication policy and quality rules, newsroom helpers, n8n snippets in a sandbox, the n8n sanitizer, and the gate and duplicate guard against a mock GitHub API (including an outage, a branch moving mid-merge and `action_required` runs).
- `npm run build`: **57 pages**. `git status` is clean afterwards.
- `npm audit --audit-level=high`: **0 vulnerabilities** (site and engines).
- `actionlint`: clean. No `${{ inputs.* }}` interpolated into `run:`.
- `engines`: **27/27 pass**, including an end-to-end MP4 render.
- Visual regression against the pre-sprint build: **16/16 screens pixel-identical** (8 pages × desktop 1440×900 and mobile 390×844). The only HTML differences: two non-visual `data-` attributes on article headers, the Save script, and the homepage search/saved bridge.
- Behavioural: the Save button saves the current story, and the homepage saved link routes to it (tested with Playwright).
- Live, read-only: the duplicate guard and the gate were evaluated against real PRs #26, #28 and #29.
- Shorts sample: `scotland-diesel-prices-over-2-pounds`, 41.0 s, 1080×1920 30 fps H.264 High / AAC, 3.6 MB, espeak narration.

### Needs the owner
1. Install or enable the Claude GitHub App with write access to Nuvellum, **or** push the bundle from your machine (commands in the final report).
2. Connect n8n (API key and URL, or an n8n MCP server) so the workflow can be exported, patched in place and run three times end to end.
3. Leave `NUVELLUM_AUTOPUBLISH` unset until n8n emits `editorialReview` and `verification`.
4. Decide what to do about the 18 placeholder articles.
5. Social accounts don't exist yet. Distribution stays in dry run.

## 2026-09-26: reconciliation into one production PR (Claude Code, n8n MCP session)

Two sessions worked in parallel:
- the `stabilize/newsroom` sprint (#30 and #31);
- the local `newsroom-v6.5-stabilization` branch, which had live n8n access over MCP.

This branch (`stabilize/newsroom`, PR #31) is now the single production PR.

**Base:** #31. It is a superset of #30 (commit `0ce89c9`) and of the repo side of `newsroom-v6.5-stabilization`:
- same AI-art rule, with a stricter shared `svg-safety.mjs` and tests;
- same `publishedAt` ordering;
- adds build hygiene, lockfile and `npm ci`;
- adds checks on `incoming/**` pushes;
- adds the publication gate with the `NUVELLUM_AUTOPUBLISH` kill switch, off by default.

**Added from `newsroom-v6.5-stabilization`:**
- `n8n/workflows/nuvellum-newsroom.json`: the sanitized export of the **live** v6.5 workflow (`8hXx6NuZuJU9dRR1`, version `b2693640`), sanitized with `npm run n8n:sanitize`; passes `check-n8n-exports`.
- `n8n/README.md`: documents what is actually deployed in each live node. The live code is canonical; the generated snippets are an alternative implementation and must not overwrite live behaviour untested. Branch hash (FNV-1a in live v6.5) and SVG handling (sanitize, then strict re-check) are corrected.
- The last human-gate wording is removed: `docs/N8N_PUBLISHING.md`, `docs/SOURCE_MATRIX.md`, and one sentence on `src/pages/standards.astro`. Outdated "n8n doesn't emit the contract" notes in `AGENTS.md` are fixed.

**Compatibility, verified locally:** a story produced by the live v6.5 Code nodes, with its sanitized AI SVG, passes this branch's `validate-content.mjs`, `newStoryQualityProblems` and `contentPolicyErrors`:
- low-risk: 0 problems;
- sensitive with `verification: "cleared"`: passes;
- `verification: "failed"`: rejected.

**Removed from production scope:**
- `engines/`, `distribution.yml`, `engines.yml`, `docs/ENGINES.md` and the gate's distribution dispatch. The gate now needs only `actions: read`.
- These are preserved unchanged on branch **`engines/distribution-shorts`** (= `1257948`).

**Superseded, close after this PR merges:**
- #30 (identical commit included here);
- #27 (see `docs/RECONCILIATION-2026-09-26.md`);
- the `newsroom-v6.5-stabilization` branch (repo changes superseded; its live-n8n history is recorded here).

Still open: #26 and #29 must be regenerated, and #28 must be closed, as the reconciliation doc says.

**n8n side (live, in place, no new versions):** Queue now also blocks DW `/live-<id>` pages and strips `maca=` and other trackers. The workflow is still **inactive**.

## 2026-09-27: release stabilization (Claude Code, n8n MCP + GitHub API session)

### Site (all merged, deployed, verified live)
- **#47:** homepage story navigation, done properly.
  - #46 had edited `public/index.html`, which the build replaces with the checksum-locked v5.1 archive, so it never shipped. A headless-Chrome audit of production scored 35/64.
  - The v5.1 transforms now live in `scripts/lib/v51-bridge.mjs`. Every behaviour patch uses `mustReplace()`, which fails the build on baseline drift.
  - Routed cards open `/article/<slug>` on click, Enter and Space. Saved stories link to real articles and escape stored text. Section toggles expose `aria-expanded` and a name.
  - A test pins `public/index.html` to the archive copy.
  - Production browser suite: **69/69**.
- **#48:** source attribution and SEO.
  - Articles never rendered `sourceNote` or `sourceUrls`. They now show a Sources note in the existing v5.1 `.context` style, with nofollow links to each original, plus JSON-LD `isBasedOn`.
  - `<time datetime>` uses `publishedAt`; the sitemap has `<lastmod>`.
  - New `scripts/check-build-output.mjs` runs in CI after the build and checks the files that actually deploy.
- **#53:** CI push race (see run 907 below).
  - `incoming/**` checks are grouped per commit and never cancelled.
  - Auto-open resolves the branch's current head.
- **#51:** committed n8n export synced to live v6.5 (`2b8eda07`).
- The build/test-verified tooling used this session (browser suite, live verifier, pollers) lives outside the repo; the in-repo guardrails are the tests plus `check-build-output`.

### Repository clean-up
- Closed #26–#30 with reasons:
  - #26, #29: fail the contract, so they are regenerated instead;
  - #27, #30: superseded by #31;
  - #28: live-blog mash-up.
- Deleted 35 branches: merged PR heads, closed duplicates and superseded work. All are archived in `Nuvellum-handoff/archived-branches-2026-09-27.bundle`.
- Kept:
  - recovery points (`backup-*`, `checkpoint/*`, `nuvellum-v5.1-production-baseline`);
  - `engines/distribution-shorts`;
  - dependabot #2, #3, #4, still to evaluate.

### n8n v6.5 (in place; still inactive, autopublish off)
- Queue: up to 5 diverse candidates per run. Execution 908 produced nothing: the opinion column, the too-short newsletter and CNBC's unextractable page were all correctly rejected.
- Earlier in-place fixes are listed in `n8n/README.md`: opinion guard, quoted titles, proper nouns, first-letter capitalisation.

### Newsroom end-to-end runs (source → n8n → branch → PR → checks → gate dry-run → merge → Vercel → live)
Run log (streak rules: a run counts only if every story it produced passes every live check):
- **902 (#44)**, sensitive, TechCrunch *Musk* ads: merge `39c1db4`, live PASS → clean.
- **906 (#49, #50)**, low risk, Deadline film tax credit and BBC Sport Robbie Ure: merges `b93a285` and `3ab901d`, live PASS → clean.
- **907 (#52, #54)**, Pope (sensitive, DW) and McDonagh (low, Variety). Both are content-clean and live, but CI cancelled the McDonagh article commit's checks and no PR opened (push race). **Run failed; streak reset.** Fixed by #53.
- **908:** nothing published (all rejections correct); not counted.
- **909 (#55)**, sensitive, Al Jazeera India/Nepal floods: live PASS → clean (1/3 after the race fix).
- **910 (#56)**, low risk, BBC Sport rugby: live PASS → clean (2/3).
- **911 (#57)**: the Verge newsletter roundup was drafted into a three-story mash-up (Googlebooks, Meta glasses, Surface Mouse). Closed, not published. **Run failed; streak reset.** v6.5 now declines roundups (drafter `skip`) and review rejects multi-story articles.
- **913:** nothing new (duplicates and correct rejections); not counted.

**Final streak: 3/3 consecutive clean runs.** Each one covers the full path: source → n8n → branch → PR → all required checks → gate dry-run READY → merge → Vercel production → live 200 → correct homepage, /latest and section placement.

| # | Exec | PR | Source | Risk | Head → merge | Live |
|---|---|---|---|---|---|---|
| 1 | 912 | #58 | BBC: Ten climbers missing after avalanche hits Himalayan base camp | sensitive, cleared | 374d3a3 → e594909 | homepage lead; #1 /latest, #1 World |
| 2 | 914 | #60 | Al Jazeera: Swiss voters set to reject tighter neutrality rules in referendum | sensitive, cleared | c93ac9c → 98ced7e | homepage lead; #1 /latest, #1 World |
| 3 | 915 | #61 | Variety: Naomi Watts reflects on early career struggles and menopause openness… | low | 512697e → 4739076 | homepage side and feature; #1 /latest, #1 Film & TV |

Correct rejections seen across runs: opinion columns (Polygon, twice via the drafter and twice via review), newsletter roundups (The Verge), unextractable pages (CNBC, Anime News Network), and exact-source duplicates.

### Other changes
- **#59:** the hidden story drawer and info modal are `inert` (Lighthouse aria-hidden-focus).
- Lighthouse, production mobile:
  - homepage: Performance 98, Accessibility 84, Best Practices 100, SEO 100;
  - article: Accessibility 100, SEO 100 (the performance trace failed on Windows, NO_NAVSTART).
- Remaining a11y items are v5.1 design decisions: footer contrast 3.2:1, ticker button 18×21px target, footer heading order.

### Open items
- **`NUVELLUM_AUTOPUBLISH` and the n8n schedule are still OFF.** This is the owner's decision.
- Known casing gap: "Control resonant" (game title *Control Resonant*, not quoted) was lower-cased in a draft that review rejected anyway. Unquoted multi-word titles whose second word also appears lower-case in the source are not restored yet.
- Dependabot #2 (TypeScript 5→7, major), #3 and #4 (actions v4→v7): not evaluated this session.
- `engines/distribution-shorts` (distribution, Shorts, provider layer) is still outside `main`; it belongs to the next milestones (M3/M4).

## 2026-09-28 — World Explorer: interaction layer rebuilt (feat/world-explorer, draft PR #67)

Checkpoint: `checkpoint/world-explorer-pre-interaction-rebuild` (e14b162).

### Causes found
- Three picking paths disagreed: click tested invisible proxy spheres at each country's *bounding-box centre* before the hit map (France/USA/Norway/Kiribati proxies sat in the sea or on other countries); hover used a different subset.
- The hit map was an anti-aliased canvas fill of ID colours, so border pixels decoded to unrelated IDs; misses fell back to a 25×25 synchronous `getImageData` search.
- Hover was rAF-debounced *and* dropped within 32 ms, so the resting pointer position was often never evaluated; nothing re-picked while the globe turned.
- The wine hover needed a full 2048×1024 repaint, so e14b162 removed it. Coverage wine fills and permanent red markers made the atlas read as a heat map.
- **The globe never ran under the production CSP**: `script-src 'self' 'unsafe-inline'` blocks the jsDelivr import of three.js (verified: the old build shows the fallback when served with vercel.json headers).

### Fix
- `src/lib/atlas-geometry.js`: exact even-odd scanline rasteriser for a Uint16 country-ID map from the same projected paths as the texture; shared by the browser and the tests. Every entity owns ≥1 pixel; anchors are interior points (not bbox centres).
- Hover and click: Three.js `hit.uv` → ID-map lookup, one pick per frame when the pointer moves or the globe turns. Small/point-only entities (<40 px) get invisible screen-space hit areas (6 px over land, 16 px over sea) and a ring only while hovered/selected.
- Highlight: the ID map is a GPU texture; the globe shader tints `hoverId` (wine) and `selectedId` (stronger wine + ivory edge). The atlas is painted once, neutral.
- three.js 0.180.0 is now a pinned dependency bundled from `'self'`.
- Data: canonical names instead of Natural Earth abbreviations (20 slugs changed; unmerged branch only), political status per entity, corrected point coordinates (Kiribati was at lon 0.12°), Tuvalu added (absent from NE 4.1.0 1:50m), UN aliases fixed (the `us` alias matched the pronoun).
- `tests/world-explorer-atlas.test.mjs` audits every entity; `check-build-output.mjs` requires every `/country/<slug>` route.

### Verification
- `npm test` 162/162; build 347 pages; build-output check passed; `npm audit` clean.
- Browser QA (Chrome, D3D11, served with vercel.json headers) over all 239 entities, with real Locate, hover and click: 239 passed, 0 failed; 0 CSP violations, 0 console errors.
- Hover stress grids (7,776 points in Europe ×2 zooms, Caribbean, Persian Gulf, Southeast Asia, Pacific): no drift; 5 points show an islet stamped for sub-pixel islands where the analytic truth is sea (by design).
- Hover sweep: 13.4 ms avg/p95 frame, ~1.1 ms per pick, 0 long tasks (old build: 26.6 ms avg, 66.6 ms p95).
- Homepage and all 109 other non-explorer pages byte-identical to the checkpoint built at the same time (the homepage embeds `Date.now()` relative ages, so builds at different times differ).

## 2026-09-28 — Homepage final polish, rebuilt (feat/homepage-final-polish, draft PR #70)

### Why PR #70's first version broke the layout
- It rendered 24 Latest rows and hid rows 6–24 with the HTML `hidden` attribute, but `.latest-row{display:grid}` overrides the browser's `[hidden]{display:none}`. All 24 rows rendered (and the filter script could not hide them either).
- The right column is a grid with rows `auto auto minmax(0,1fr)`, so In Focus stretches to the left column's height: at 1440×900 the left column went from 1,166px to 2,842px and In Focus from 414px to 2,050px (page 2,731px → 4,407px).

### Replacement (on top of PR #70, which is kept in history)
- Renderer and build check restored from `main` (2636fb2, the approved baseline) and re-implemented.
- Latest: ALL · WORLD · BUSINESS · TECH · CULTURE · SCREEN & PLAY · SPORTS as a keyboard-accessible tablist (arrows, Home/End). Only the five visible rows are in the DOM; other sets live in `<template>`s. The list reserves exactly five 83px slots (109px on mobile; one-line titles on desktop as in the baseline), so its height never changes. Shorter sets end with a quiet "Browse <section> →" note. Rows fade/glide on switch; rapid switching settles on the last choice.
- Popular Reads: 31px serif heading, long thin rule, aligned tabs, numbered rows with slightly more air, right-aligned truthful reading-time column (no view counts).
- Motion: one token family (`--ease`, `--t-quick/.24s`, `--t-base/.42s`, `--t-slow/.8s`, 10px rise). Section reveals use the CSS `translate` property so they never override hover transforms; stagger 70ms (max 210ms). Hero: 32s drift. Screen & Play slightly stronger. Reveal is enabled in `<head>` before first paint; jumps reveal skipped sections; a CSS failsafe shows everything after 2.5s if the page script fails; reduced motion and no-JS show everything immediately (ticker still moves).
- Saves are delegated, so rows swapped in by filters work (same storage key and classes).
- `check-build-output.mjs` fails the build if more or fewer than 5 Latest rows render outside templates, or if the fixed five-row list is removed.

### Verification
- Geometry (px) at 1440×900 — baseline / PR #70 / now: left 1166 / 2842 / 1187; right 1166 / 2842 / 1187; In Focus 414 / 2050 / 411. Same at 1536×1024; tablet and mobile In Focus heights equal the baseline. Heights are identical across every filter and Popular tab.
- Browser QA: 79/79 interaction checks (every filter, keyboard, rapid switching, saves, Popular tabs, all 8 World Desk regions, map tooltip, ticker, logo animations, hover motion, night mode, reveal safety incl. End/anchor jumps, reduced motion, JS disabled, simulated script failure, tablet/mobile overflow); 0 console errors, 0 CSP violations.
- Logo CSS and header markup, ticker CSS, save-icon SVG/rules and lower-page markup identical to the baseline; World Explorer, publication scripts and locked assets untouched.

### 2026-09-28 — Homepage motion refinement (motion only; layout unchanged)
- Cause of the abrupt reveals: entrances used the crisp interaction curve `cubic-bezier(.16,.8,.2,1)`, which does ~80% of its movement in the first quarter, so an 800ms reveal read as a pop; fast scrolling also started full-length fades on content already on screen.
- One ease-out family: `--ease` (interactions) and `--ease-enter` `cubic-bezier(.22,.61,.36,1)` (entrances). Entrances 0.72–0.9s, hovers 0.38s (`--t-hover`), image zooms 0.6s (`--t-media`).
- Hero copy: one first-load entrance (kicker, headline, dek, metadata; 70ms apart, 8px rise); image drift kept.
- World Desk: story rows and summary slide in individually (60ms stagger) on region change; no replay when moving within the active region; stories glide 3px with a slight image zoom on hover. Map transition unchanged.
- Screen & Play: lead image settles from 1.05 over 1.8s on reveal and drifts slowly on hover (zoom + translate, 2.6s); lead copy staggers in; side stories glide in from the right on desktop (vertical below 900px) and respond with image drift and an eyebrow tint.
- Per-child stagger (70ms) for Latest rows, Popular rows, In Focus, Screen & Play; Opinion unchanged apart from normalised timing.
- Newsletter: kicker, headline (+140ms), then form (+280ms) with a left-to-right wipe.
- Scroll-speed aware: fast flicks use a short 0.5s reveal with no stagger; sections jumped past appear immediately. Failsafe, print, reduced motion and no-JS keep everything visible. Entrance animations use `fill: backwards` so nothing is left on elements afterwards.
- Verified: all 1,912 element layout boxes identical to 36817f2 at 1536×1024, 1440×900, 834×1112 and 390×844; motion QA 20/20; interaction QA 79/79.

### 2026-09-28 — Homepage motion made perceptible (motion only; layout unchanged)
Measured, not assumed: a reading-speed scroll sampled every animated element's opacity and position per frame, first loads were traced frame by frame, and the result was screen-recorded and inspected.
- Why the previous pass was imperceptible:
  1. The jump-safety sweep revealed anything whose top crossed the viewport's bottom edge, so every entrance played in the bottom sliver of the screen.
  2. "Fast scroll" was judged per scroll event (>1.8px/ms); real wheel/trackpad scrolling crossed it constantly, so most reveals ran the short, unstaggered mode.
  3. On load the browser painted only ~4 frames in the first second (initial layout/paint of a large page), so the hero entrance ran while frames were blocked.
  4. Fading the World Desk panel re-rasterised the map's SVG texture filter every frame (>1s freeze).
- Now: reveals start at ~15% above the viewport bottom; scroll speed is averaged over 120ms (short mode only above 4px/ms); every story/heading is its own unit, staggered 75ms in screen order; panels only fade briefly; all motion starts once three frames arrive under 50ms after load and fonts (cap 1.4s); the hero entrance class is set on the hero, not <html> (a root class change repainted the whole page); the World Desk panel is not faded.
- Filter/tab swaps: rows exit, new rows are inserted hidden and enter two frames later; template thumbnails are fetched and decoded while idle. Thumbnail scale settles were dropped (scaling several sepia-filtered thumbnails produced 170–240ms frames); the hero and Screen & Play lead keep an image settle.
- Results (1440×900): hero chip → headline → dek → meta complete at +0.92 / +1.00 / +1.09 / +1.19s with 48 painted frames (warm load); every section below the fold animates visibly (450–875ms of visible change) starting at 57–82% of viewport height; World Desk rows 80ms apart with the summary after; Latest rows 70ms; Popular rows 60ms.
- Known limits: on a first visit in a slow/software-rendered browser, rasterising the ~20 illustrated SVG images can overlap the hero entrance (it then resolves in a frame or two by ~1.5–2s rather than hiding content longer); the first Latest switch in a session has one ~120ms frame (later switches 13–27ms).
- Verified: all 1,912 element layout boxes identical to 4c8e721 at four viewports; interaction QA 79/79; reduced motion, no-JS and script-failure cases keep everything visible.

### 2026-09-28 — Day/night switch: profiled and restructured (theme palettes unchanged)
Profiled with Chrome performance traces (GPU/ANGLE D3D11, Intel HD Graphics), 6 toggles each at the top and middle of the page, plus DevTools screencast frame capture.
- Real bottleneck: the page is a single paint layer (every paint was layer 0, 1440×2752), and colour transitions (body/header plus the reveal units' own colour/background transitions, which ran up to ~600ms) restyled the whole document every frame (inherited `color`; 2,700–4,800 element restyles, 81–148ms style per toggle) and re-rasterised the entire viewport each frame, filtered artwork included (999 saveLayer ops; GPU saturated). Layout was ~1ms, image decoding negligible, the paper grain and map were not the driver, and there are no backdrop filters in play. The page is otherwise idle (0 paints/s).
- Fix: the palette flips in one frame (all transitions suppressed only during the switch); where supported a 180ms View Transition crossfades the two rendered states on the compositor; otherwise the switch is instant. Theme-invariant filtered thumbnails and the hero image get their own compositor layers so they are not re-rasterised on a switch. Support-card images and the World Desk map are deliberately not layered: layering the support images changed their rendering and the chip text anti-aliasing; the map layer gave no measured gain.
- Before (2d10249) → after, top of page: style 81 → 39ms; restyled elements 2,774 → 1,526; tile raster 76 → 15ms; worst frame 116 → 91ms; frames >34ms 9 → 2. Mid-page: style 148 → 40ms; worst frame 67 → 34ms; frames >34ms 7 → 1. Screencast: before produced 15–16 frames in the 700ms after the click (70–119ms apart, dark only after ~410ms); after 47 frames, 8–16ms apart, crossfade complete by ~300–380ms. The crossfade starts ~100–130ms after the click (the View Transition waits for the GPU to snapshot the old page and raster the new one).
- Visuals: day and night full-page renders match the previous build except 226 sub-pixel edge samples inside small thumbnails (fair comparison with the hero composited, as it always is live). Layout boxes identical at four viewports.
- Note: two interaction-QA expectations (hero timing, reduced-motion "motion-soft") fail identically on 2d10249; they reflect bc82ad3's intentional motion changes, not this work.

## 2026-09-28 — Independent review of #71, #73 and draft #74 (geography contract)

Verified: schema/validator/gate/buildArticle agree on the eight region slugs and array limits; the #74 candidate's changed Code nodes, executed end to end on fixtures, carry `regions`/`countries` through review, verification and SVG nodes into the committed file (all intermediate nodes spread the item and edit frontmatter by key), which then passes the repository validator and publication gate; missing/unknown geography fails closed; empty arrays are accepted; old content is grandfathered; the parsers (repository, Astro YAML, homepage renderer) read the JSON-style arrays. #73: actions/checkout@v7 and setup-node@v7 exist; TypeScript 5.9.2 is required by @astrojs/check 0.9.10; World Explorer passes the 239-entity browser QA on three 0.186.1 with no console errors or CSP violations.

Defects fixed (branch review/geography-contract-fixes, on top of #74):
- Consumers ignored an explicit `[]`: `regionsForArticle` and `articleMatchesCountry` fell back to headline inference, so a story declaring no geography could still be filed on a region/country desk. An explicit array is now authoritative; stories without the fields keep inference.
- Country names were only length-checked, so "US", "USA", "Gaza", "Bosnia" or "The Netherlands" passed every gate and silently never reached a country desk. `resolveCountry` maps names, aliases and Natural Earth labels to one World Explorer entity (320 terms, no collisions); the validator rejects names it cannot place and alias duplicates; the draft prompt names the canonical forms.
- The repository branch helper disagreed with live v6.5 (SHA-256 over the canonical URL with a 72-character slug vs FNV-1a over host+path with a 60-character slug), contradicting the README's "same contract". The helper now ports the live logic; a test runs the live node code against it.
- #74's contract test only matched source text; it now also executes the candidate's Code nodes end to end.

Site output: all 349 built pages byte-identical to #74 (no current article carries geography). Tests 175/175, build, build-output, validate, audit clean. Live n8n not accessible from this session.

## 2026-09-28: live v6.5 geography sync (PR #74, n8n MCP session)

- Snapshot before the change: live `081d8faa` (inactive, 65 nodes), full definition saved. n8n version history also keeps it.
- Three-way merge. Base `2b8eda07`, the version PR #74's candidate was cut from. Live-only changes since then: `c875619a` (Queue: `MAX_CANDIDATES = 5`) and `081d8faa` (Draft prompt roundup/newsletter skip; Review prompt multi-story rejection). PR #74 only changed Draft prompt, Parse Draft & Build Markdown and Build GitHub Payload. Only the Draft prompt was changed on both sides, and it was merged by hand (live prompt plus the two geography blocks).
- Beyond the #74 candidate: Parse Draft resolves countries through the World Explorer index (320 terms from `src/lib/countries.js`), writes canonical names and fails closed on anything unplaceable. Build GitHub Payload rejects non-canonical or duplicate countries and duplicate regions before commit.
- Live is now `bcf2474f-ad85-42d1-9881-d8f44d5670db`. Re-fetched and compared with the snapshot: same 65 nodes, identical connections and settings, and only those three nodes' parameters differ. Still inactive, no published version. `NUVELLUM_AUTOPUBLISH` was not touched.
- `n8n/workflows/nuvellum-newsroom.json` is the sanitized export of `bcf2474f`, and its node parameters equal live's. New contract tests pin the live-only fixes and check that the embedded country tables match `src/lib/countries.js`. They also cover alias canonicalisation and fail-closed handling, plus the pre-commit gate refusing tampered geography. They fail on the old candidate.
- `npm test` 180/180, `npm run validate`, `npm run build` (347 pages), `check-build-output`, `npm audit` (0 vulnerabilities): all pass.
- Next: three real end-to-end verification runs (not started).

## 2026-09-28: live v6.5 end-to-end verification runs (n8n MCP session)

Live workflow `8hXx6NuZuJU9dRR1` at version `bcf2474f` (geography contract merged onto `081d8faa`; export on PR #74). Three manual executions, one at a time. The workflow stayed inactive, the schedule off and `NUVELLUM_AUTOPUBLISH` untouched. Nothing was merged.

| Run | Execution | Candidates | Stopped | Committed | PRs | Geography |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 921 | 5 | CNBC (18-word source), Guardian film review (drafter skip), Variety list (>4 regions, failed closed) | 2 low-risk | #76 NASA robotics, #77 Klopp/Germany | `["north-america"]`/`["United States"]`; `["europe-central-asia"]`/`["Germany"]` |
| 2 | 922 | 5 | CNBC (no text), NASA + DW (exact duplicates of open PRs), Guardian review (skip) | 1 low-risk | #78 and #79 (duplicate, see below) | `["europe-central-asia","north-america"]`/`["United Kingdom"]` |
| 3 | 923 | 5 | CNBC (20 words), Deadline + NASA (exact duplicates), Guardian review (skip) | 1 sensitive | #80 Ben-Gvir/prisoner | `["middle-east-north-africa"]`/`["Israel","Palestine"]` |

- n8n path clean in all three runs: no node errors or stalled branches, rejected candidates failed closed while processing continued, and duplicate sources were stopped at "Exact Source Duplicate?". Countries resolve through `resolveCountry`. Branch names equal `scripts/lib/newsroom.mjs` `branchName`. Each branch adds exactly `src/content/articles/<slug>.md` and `public/generated/ai/<slug>.svg`, and `newStoryQualityProblems` is empty for every story.
- Low-risk stories carry `editorialReview: "passed"`. Sensitive #80 stayed `review` after editorial review and became `published` only with `verification: "cleared"` and `reviewedBy: "Nuvellum Verification Pipeline"`.
- GitHub push checks on the incoming commits (Build, Security, CodeQL, Editorial duplicate guard, Auto-open) all passed, 9 of 9 each. The PR-event copies show `action_required` because the PRs are opened by `github-actions[bot]`. Auto-publish ran and merged nothing.
- **Defect: duplicate editorial PR.** Run 2's branch got #78 and #79 (same head, base and second). `auto-open-editorial-pr.yml` grouped concurrency by `github.sha`, so the SVG and article pushes (about 1 s apart) ran in parallel, both found no PR, and both created one. Fixed by grouping on `github.ref` (`cancel-in-progress: false`), pinned in `tests/open-editorial-pr.test.mjs`. #79 closed as redundant; #78 kept as the audit copy.

### Editorial-quality follow-ups (not part of stabilization)
- #77 copies DW's question headline ("Will Jürgen Klopp's charisma be enough for Germany?") too closely.
- #80 states settlements are "considered illegal under international law" in Nuvellum's voice; it needs attribution.
- Candidate slots are sometimes spent on sources that then fail extraction (CNBC every run) or that are declined every run (the same Guardian film review).
- Person names were not verified against outside sources in these runs.
- The pipeline cleared #77 and #80, but they must not be published as they stand. The owner decides after editorial fixes.
- Also seen: run 2's headline "Vmi worldwide…" (source "VMI Worldwide"), a `north-america` region tagged from a film's fictional setting, and a slug cut mid-word by the 90-character limit.

### Regression rerun after the concurrency fix (#81, main `6064e2b`)
- Execution 924 on live `bcf2474f` (unchanged), manual, workflow still inactive. 5 candidates, 2 stopped for thin source text (CNBC, Anime News Network), 3 committed on branches cut from `6064e2b`.
- Exactly one editorial PR per branch: #82 (sensitive, verification `cleared`, pipeline `reviewedBy`), #83 (low risk), #84 (low risk). For each branch the three pushes arrived within about 3 s. Auto-open ran once for the branch creation, the SVG commit's run was cancelled while still queued when the article push's run replaced it, and the article run then corrected the existing PR. No duplicate PR.
- Push checks green on every head commit (Build, Security, CodeQL, Editorial duplicate guard, Auto-open). Geography contract valid, including the first real `[]`/`[]` story (#84). Branch names match `branchName`. Nothing merged.
- More editorial follow-ups, again not stabilization work: #84's `[]` misses Anguilla and Antigua and Barbuda, which are material to the story. #82 over-tags Israel, Nigeria and `middle-east-north-africa` from passing mentions, its source is a France 24 TV-interview page (`/tv-shows/` is not blocked), and its headline keeps the source's all-caps "'RACE-BASED POLICY'". Hold #82 and #84 for editorial fixes, like #77 and #80.


## 2026-09-28 — analytics and observability foundation

- Added an optional GA4 reader-analytics layer injected only when `NUVELLUM_GA4_ID` is configured in production. With no ID, the build output receives no analytics script.
- Custom events are deliberately narrow: page views, 25/50/75/90% scroll depth, article clicks, save-story actions, newsletter interactions and outbound domains. Explicit event fields strip URL query strings and do not send ingestion/source URLs.
- Added a six-hour + main-push newsroom health workflow reporting article output, section/risk/source diversity, visual-mode mix, incoming editorial PR backlog, core GitHub checks and deployment checks when available.
- Alerting stays conservative: only concrete failed checks/deployments or an unheld incoming PR stuck >24h while autopublish is on fail the health job; publication inactivity is warning-only.
- Added `npm run ops:report`, tests for analytics injection and report classification, `docs/OBSERVABILITY.md`, and updated the privacy/CSP/environment documentation.
- n8n execution-level telemetry is intentionally left for a separate live-workflow pass because this repository session has no n8n connection.

## 2026-09-29 — social distribution v1 extraction

- Inspected the old `engines/distribution-shorts` branch instead of merging it: it had diverged heavily from current production, so only the useful distribution ideas were rebuilt on current `main`.
- Added a zero-cost, dry-run social distribution engine for X, Threads, Facebook, LinkedIn and Instagram.
- Copy is deterministic and article-grounded: headline/dek only, no paid model dependency. Platform links carry UTM source/medium/campaign/content fields for later GA4 attribution.
- Text-led articles request a designed social card rather than receiving unrelated fallback art.
- Added a separate GitHub workflow that tests the engine on PRs and produces JSON social-draft artifacts after new published articles reach `main`.
- No social credentials, posting APIs or live-post switch exist in this version. Publication remains completely independent.

- Expanded social draft targets to seven platforms: X, Threads, Facebook, LinkedIn, Instagram, TikTok and YouTube Shorts.
- TikTok and YouTube are explicitly marked `video-needed`; they do not pretend that an article image is a video. YouTube gets separate title/description output.

- Clarified distribution architecture after owner review: social output is not one format per platform. It now has parallel **feed/static** and **short-video** tracks.
- Feed/static: X, Threads, Facebook, LinkedIn, Instagram.
- Short video: X video, Facebook Reels, Instagram Reels, TikTok, YouTube Shorts.
- This keeps the original card/link-post plan while making the upcoming Shorts engine reusable across every video-capable launch channel.

## 2026-09-29 — Nuvellum social-card renderer

- Added a deterministic zero-cost social-card renderer for the feed/static distribution track.
- Produces 1080×1080 square and 1080×1350 portrait SVG cards per published story.
- Image-led cards embed the article's actual photo or approved illustration and preserve the Nuvellum editorial identity; approved AI art is explicitly labelled `ILLUSTRATION`.
- Text-led cards use typography, wine rules, the N✦ mark and negative space instead of inventing imagery.
- Feed drafts now reference generated cards: square for X/Threads/Facebook/LinkedIn, portrait for Instagram.
- Distribution CLI renders the cards automatically; GitHub Actions uploads card assets and JSON drafts together.
- Live posting remains disabled. SVG cards are the deterministic source assets; raster conversion will be added only when a platform adapter actually needs JPEG/PNG.

## 2026-09-29 — zero-cost Shorts/Reels engine v1

- Added a real 9:16 video pipeline for X video, Facebook Reels, Instagram Reels, TikTok and YouTube Shorts.
- V1 is intentionally extractive: hook and beats are selected from the published article's own sentences and remain verbatim. No model paraphrase is used, including on sensitive stories.
- Added free/local narration chain `piper -> espeak -> silent`; CI uses espeak-ng only to prove the pipeline at zero API cost.
- Added deterministic 1080×1920 Chromium/ffmpeg rendering, timed captions, poster JPEG, SRT, script/plan/report JSON and a Nuvellum end card.
- Image-led stories use their actual article image; text-led stories get a typographic vertical treatment rather than invented imagery.
- Added a PR render smoke workflow that produces a real preview MP4 artifact. Nothing posts publicly and the publication gate does not depend on video generation.
- espeak is explicitly a functional fallback, not the intended final public voice quality. A local Piper voice or another approved voice must be chosen before automatic public posting.
- PR smoke run `36489556135` rendered the text-led Pokémon TCG story successfully: 34.87 s, 523 preview frames at 15 fps, extractive script, espeak narration, MP4 + poster + captions/script/plan/report artifact (~2.0 MB). Social distribution tests, Build, Security and CodeQL were green on the same head.

## 2026-09-29 — visual eligibility gate tightened

- Tightened the post-newsroom GitHub visual pass so ordinary `News` stories resolve to **real photo or text-led**, not generic generated illustration.
- `Opinion` / `Essay` / `Ideas` remain illustration-first; genuinely abstract `Analysis` may still keep a story-specific illustration after the real-photo pass.
- When a News story arrives with only `/generated/ai/<slug>.svg` (or a retired house plate) and no sufficiently relevant Commons photo clears the threshold, the visual pass now removes image metadata and the unused generated SVG, producing an intentional text-led article.
- Added regression tests for technology/film news classification and text-led metadata cleanup. This change does not alter article copy, editorial clearance, or publication gates.

## 2026-09-29 — mobile In Focus regression

- Fixed the homepage `In Focus` responsive grid after a real-phone QA recording showed secondary cards crushed into narrow columns with a large blank area before `Screen & Play`.
- At tablet/mobile widths the inherited desktop row sizing is now reset; text-led mini stories use a single text column.
- At phone widths secondary stories stack vertically with readable image/text proportions and no phantom empty grid row.


## 2026-09-29 — mobile browser/PWA chrome repair

- Real-device screenshots exposed two metadata regressions from the favicon pass: a literal `\\n` was rendering above interior pages, and the web manifest itself ended with literal `\\n`, making it invalid JSON.
- Removed the stray text from both shared/interior head markup and the generated homepage head.
- Repaired `manifest.webmanifest` and added dedicated 192px/512px PNG app icons plus a 180px touch icon so Android/Samsung recents and launch surfaces do not fall back to a generic grey tile or unrelated page art.
- Added a maskable 512px icon entry and regression tests for manifest validity, PNG signatures and literal-newline leakage.

## 2026-09-30 — representative visual fallbacks

- New fallback chain for article, card and hero images:
  1. the story's own licensed photo;
  2. a **representative** licensed photo of its primary subject (`scripts/visual/representative.mjs`), a Wikidata-resolved person, organisation, institution, event or place;
  3. text-led.
- The representative caption states *"Image of X, not of the events reported."* Licence, credit and provenance checks are unchanged. See `docs/VISUAL_ACQUISITION.md`.
- Story-photo tier guard: a matching file dated more than a year before the story, or showing another ceremony, meeting or visit, is no longer used as the story's own picture.
- Engine bugs found while testing (all were silently rejecting or mis-sizing Commons candidates):
  - thumbnails served from `thumb.wikimedia.org` failed the host check;
  - width/height were read from the requested thumbnail rather than the original, so small originals passed the 1200px floor;
  - `http://creativecommons.org` licence URLs failed validation. They are now upgraded to https for known HTTPS hosts only.
- Hero: the newest World story with a real or representative image among the six newest World stories leads, else the newest story with an image in the top six, else the previous rule.
- Applied to the 29 September edition:
  - Trump AI accord → Trump official portrait (person);
  - NASA contract → NASA HQ (organisation);
  - CinemaCon → CinemaCon 2025 banners (event);
  - Cornell → Helen Newman Hall (institution, legal-restraint rules);
  - Icebreaker → Netflix HQ (organisation; no qualifying Icebreaker image);
  - Sanderson games → Brandon Sanderson portrait (person; PNG re-encoded to JPEG, 3.8 MB → 0.2 MB, no crop);
  - Roy Keane / Rooney unchanged.
- The hero was text-led Cornell and is now Cornell with its image.

## 2026-09-30 — Saved stories: working /saved end to end

- **Root cause of the 404.** The code was not at fault: main has generated `/saved/index.html` since #151. Vercel rejected every deployment from 08:03 GMT with "Deployment rate limited — retry in 24 hours" (the Hobby daily build cap), which hit #150, #151 and #152.
  - #151 was pushed as four commits. Only the first ("Header: point bookmark to the saved reading list") got a preview build, so that preview linked to `/saved` without the page, and returned a 404.
  - Production is still #149, so its bookmark still goes to `/latest`. The next successful main deploy fixes production.
- **Real defects found and fixed while verifying in a browser:**
  - the page's rows were created by script, so Astro's scoped styles never reached them. They rendered as unstyled text with default buttons. The styles are now global and `saved-*` prefixed;
  - Remove worked by row position, so it could remove the wrong story if the list changed in another tab. It now removes by story;
  - the homepage bookmark was a `<button>` with a script redirect. It is now a real `<a href="/saved">`;
  - article saves were appended while homepage saves were prepended, so the list had no consistent order. Both now put the newest first.
- **`src/lib/saved-list.js`** holds the shared, tested helpers:
  - it reads legacy `{title,url}` and current `{title,cat,url}` entries from `nuvellum-saved-v2`;
  - it de-duplicates and drops garbage entries;
  - it turns absolute Nuvellum URLs into site paths;
  - it never makes foreign or `javascript:` URLs into links.
- **Rows** show section · format · reading time (from `/search-index.json`, else the entry's `cat`), then the headline, dek and Remove. Clear all asks for confirmation in place.
- **Build check** (`check-build-output`):
  - `saved/index.html` exists and is noindex;
  - `/saved` is not in the sitemap;
  - the masthead bookmark on the home, latest and article pages links to `/saved` and never `/latest`.
- **Browser (Chrome, local dist):** 23/23 checks passed, covering save from an article and a homepage card, the masthead bookmark to `/saved` on home, article and mobile, opening, removing, reloading, unsaving on an article, a legacy absolute-URL entry, dark mode, mobile with no horizontal scroll, and Clear all.


- **Deployment retry, 30 Sep 2026:** production was retried after the Resend Brief integration merged. If Vercel still reports the Hobby daily build-rate limit, no further repository changes are required; retry after the limit window clears.


- **Brief delivery hardening, 30 Sep 2026:** unsubscribe signatures now rotate with renewed consent. Production deploy retried after the protected-main merge so the hardened token logic can replace the previous deployment.


- **Brief hardening deploy retry, 30 Sep 2026:** retried production after the Vercel Hobby build-rate window was expected to reset. No application behavior changed in this retry commit.


## 2026-09-30 — Nuvellum Brief daily delivery automation

- Added a deterministic daily Brief issue builder using the three newest eligible published production stories; seed placeholders without a production origin are excluded.
- Added a private `/api/brief-send` production function. It uses the canonical Upstash consent list, per-reader signed unsubscribe links, RFC 8058 one-click headers, Resend batch delivery (100 per call), a 1,000-recipient safety cap, daily issue state and idempotency keys.
- Added GitHub Actions scheduling at 06:00 UTC. GitHub stores no mail credential: the workflow authenticates to Vercel with a short-lived GitHub Actions OIDC token. Main pushes are dry-run only; scheduled runs are live; manual dispatch is dry-run unless explicitly promoted to send.
- Fail-closed rules: no send with fewer than three eligible stories, no new story since the prior issue, no active subscribers, an already-sent Cairo date, unhealthy configuration/store, or an audience over the safety cap.
- Added tests for story selection/escaping, batch chunking/idempotency, single-send behavior, push dry-run behavior and OIDC claim/signature enforcement.
- No approved site visuals were changed.


- **Brief unattended-send safety follow-up, 30 Sep 2026:** audited the live Resend plan before enabling unattended delivery. The account currently allows 100 emails/day and 3,000/month, so the sender now fails closed above 100 deliverable readers instead of the earlier generic 1,000-reader cap. Live QA-origin subscribers are excluded from scheduled sends even if a test record remains locally active. Added regression coverage for both safeguards.

- **Brief sender safety deploy retry, 30 Sep 2026:** production retry queued after Vercel rejected the safety-guard merge under the Hobby rolling build-rate limit; no application behavior changes in this retry commit.


- **Evening production retry, 30 Sep 2026:** retried the latest stabilized main deployment after the Vercel Hobby build-rate window was expected to clear. No application behavior changed in this retry commit.

- **Vercel ignored-build verification, 30 Sep 2026:** non-production main commits should now be skipped by the repository `ignoreCommand`, preserving Hobby build-rate budget for actual site changes.

## 2026-10-01 — final autonomy sprint: Nuvellum runs unattended

**Audit findings (real state, not notes):**
- n8n v6.5 was **inactive**; all 28 recorded runs were manual.
- `NUVELLUM_AUTOPUBLISH` was off.
- Auto-published stories could never get social cards: `GITHUB_TOKEN` merges fire no push workflows.
- The Brief's 06:00 cron had **never fired**.
- Nothing alerted the owner.
- Branch protection made automatic merging impossible for any story with an acquired photo (found in the rehearsal, below).

**Changes:**
- **#199 publication chain:**
  - After merging, the gate dispatches card generation, and the card workflow sweeps recent stories without cards.
  - A daily publication cap (`NUVELLUM_PUBLISH_DAILY_CAP`, default 24) protects the Vercel Hobby limit of 100 builds a day.
  - Owner alerts: one `ops-alert` issue per condition, @-mentioning the owner, with an optional Telegram DM; it closes itself.
  - The Brief moved to an off-peak cron with idempotent backups.
- **#200** Shorts autopilot, video adapters and Instagram/Threads feed adapters. **#209** later made the Shorts autopilot a manual fallback by owner decision: no schedule, and public posting needs `NUVELLUM_SHORTS_PUBLISH=on`, which is not set.
- **#203:**
  - The n8n export is synced (active, every 3h).
  - Meta media is served via jsDelivr: raw GitHub serves `application/octet-stream`, which Meta rejects.
  - The ignored build step also covers `n8n/`.
- **#208 (rehearsal fix).** `visual-acquire` pushes the photo commit with the repository deploy key (`NUVELLUM_DEPLOY_KEY`). Its `GITHUB_TOKEN` push plus dispatched checks never attached to the PR, so branch protection answered "3 of 3 required status checks are expected".
- **#209 (rehearsal fix).** Every gate run sweeps all open incoming PRs. 28 of 36 queued gate runs were dropped by GitHub's one-pending-run concurrency, which stranded #205.
- **Owner actions:**
  - Turned on `NUVELLUM_AUTOPUBLISH`.
  - Activated n8n version `807b29b1` (the schedule changed from hourly to every 3 hours: about 3 stories a run).
  - Added the deploy key and its secret.

**Dress rehearsal (real production):**
- **Execution 949 (12:56 UTC)** produced #204–#207. Gate, checks and verification all passed, and branch protection blocked the merge, which is how #208 was found. After #208 and a branch update, the gate (`github-actions[bot]`) auto-merged:
  - #204 at 14:03:18;
  - #206 at 14:03:39, a sensitive story with verification cleared;
  - #207 at 14:03:59.
- **Downstream of those merges:**
  - Vercel deployed each one.
  - The articles answer 200.
  - Six card files per story are on `social-assets`, and the gate dispatched card generation.
- **Scheduled execution 950** fired by itself at **15:00:19 UTC**, succeeded, and opened #210–#213. The gate auto-merged #211 and #212 within about 2 minutes.
- **Alerts:** issues #201 (newsroom silent) and #202 (deploy) opened, then closed themselves when the conditions cleared.
- **Social publish (13:10, scheduled):** "nothing to do", which is correct since every story in its window was already sent. Today's stories are picked up by the next scheduled run (at most one per run).
- **Shorts:** one automatic render (Icebreaker, 32.7s, Piper) was verified and stored. Every platform was `blocked_credentials`, so nothing was posted.
- **Other live checks:**
  - GA4 on production, 11/11: consent first, one `page_view`, `page_type`, no PII, UTM.
  - Production smoke: 344 checks, 0 failures.
  - Brief dry run: 3 real recipients, 0 QA.

## 2026-10-01 — hourly publication cadence

Owner request: publish hourly. No new workflow, no gate changes.
- **n8n.** Canonical v6.5 `8hXx6NuZuJU9dRR1`: the Schedule Trigger changed from every 3 hours to **every hour**. It was edited in place as version `f8891965`; the owner activates it. No other node changed. The export and contract test are synced.
- **Publication gate:**
  - **Limit.** At most **1 automatic merge per rolling hour**, on top of the unchanged rolling cap of 24 a day. Further approved PRs stay open and are reconsidered on the next sweep, newest first.
  - **Fail closed.** If recent merges can't be counted, nothing merges that run (previously the gate assumed the full cap).
  - **Bounded API use.** Once the limit is reached the gate stops evaluating, so a growing queue cannot exhaust the `GITHUB_TOKEN` API budget.
  - **Unchanged.** Every editorial, verification, duplicate, quality and branch-protection rule.
- **Owner alert.** `stuck-incoming` now fires only when PRs wait more than 6h **and** the gate hasn't published for 3h. Queued stories alone are normal at this cadence.
- **Unchanged.** Social cadence (at most 1 story per 3-hourly run) and the daily cap.
- **Side effect.** n8n yields about 3 approved stories an hour, and only 1 an hour publishes. The queue of open approved PRs therefore grows by roughly 2 an hour, and older ones age. Nothing auto-closes them yet; that needs an owner decision.

## 2026-10-01 — one publishable story per hourly run

Owner request: don't let approved incoming PRs pile up (hourly runs produced about 3 approved stories, and 1 published).
- **The guard.** Canonical v6.5, edited in place as version `5e78c5f1`, published by the owner. Two nodes are added between the candidate loop and Fetch Full Source: **One Story Per Run** (Code) and **Story Already Published This Run?** (If).
- **Behaviour.** Once a story has been committed in an execution, every later candidate is skipped before any fetch or model call. Telemetry records it as `queue:run_quota`, event `candidate_skipped`, not as a rejection.
- **Which story.** The run publishes the first candidate, in the existing newest-first, source- and section-diversity order, that clears every gate. A weaker candidate is tried only when a stronger one was rejected by a gate, or its push failed, in the same run, and it passes the same gates. There is never more than one incoming PR per run.
- **Unchanged.**
  - The queue and its source diversity.
  - The draft, editorial review, sensitive verification, duplicate and quality nodes.
  - The publication gate's limit of 1 per rolling hour (now the second safety limit) and the 24/day cap.
- **Safety and fidelity.** The guard fails open on an internal error, so the gate's hourly limit still holds. The If condition is always boolean, so an error can't fail the run.
- **Tests and sync.** `tests/n8n-one-story-per-run.test.mjs` runs the exported guard against fixtures. The live draft was compared with the repo export: 69 nodes, with identical parameters, error handling and wiring.

## 2026-10-01 — hourly social posting

Owner request: post to social hourly, offset from the newsroom.
- **Schedule.** `social-publish.yml` moves from `12 */3 * * *` to **`35 * * * *`** (every hour at minute 35). The newsroom runs at minute 0. By :35 that hour's story has normally been merged by the gate, deployed by Vercel and given its cards. The publisher still posts only once the article answers 200.
- **Unchanged:**
  - **Pacing.** At most one story per scheduled run: a queued retry first, otherwise the newest actionable story in the 48-hour window. The old backlog is never dumped.
  - **Ledger.** The `social-ledger` idempotency (`sent`/`failed` are final), so there are no duplicate posts.
  - **Adapters.** Telegram, Facebook, Instagram, Threads and LinkedIn.
  - **Shorts/Reels** stay disabled and manual.
- **Tests and docs.** The two cadence tests and the docs (SOCIAL_DISTRIBUTION, SOCIAL_PLATFORM_SETUP) are updated.

## 2026-10-01 — World Desk: regions show only their own stories

- **The bug.**
  - On the homepage World Desk, any region with fewer than 3 stories was topped up with the latest World stories ("World desk ·" rows).
  - `/world/<region>` showed a "From the World desk" block when the region had no stories.
  - Both put stories under the wrong continent and duplicated them across desks. Seen live: the Renee Good story (North America) appeared under Latin America & Caribbean on both surfaces.
- **The fix.**
  - Both fallbacks are removed.
  - An empty region shows "No stories on this desk yet." (homepage list, in the existing muted italic voice) or the existing "No reporting has been filed to this bureau yet" note (region page).
  - The map, tabs, counts, styling, animations and World Explorer are unchanged.
  - Country desks were checked: their "Regional context" already uses only the country's own region.
- **Tests.** `tests/world-desk-regions.test.mjs`:
  - a Sub-Saharan Africa story can't appear under Latin America or North America;
  - the template has no fallback;
  - for **every** region in the built output, both the homepage desk and `/world/<region>`, each linked story carries that region.
  - The tests fail on main's build and pass with the fix.

## 2026-10-01 — freshness policy, 50-minute gate gap, social after cards

The problems, observed live:
- **GitHub scheduled runs barely fired.** Only one scheduled run started between 13:28 and 20:00 UTC, so social posting never ran and Telegram posted nothing today.
- **The gate merged about every 2 hours.** It runs when each hourly push lands (around :01–:04), and the previous merge at about the same minute was always just under a strict 60 minutes old.
- **Old approved news piled up.** Newest-first left #205, #213 and #218 waiting forever.

The changes:
- **Gate gap.** Another story may merge once the previous merge is **at least 50 minutes old** (`MIN_GAP_MINUTES`). The 24/day cap and every editorial and sensitive-verification rule are unchanged.
- **Freshness policy.**
  - **What expires.** Newest-first stays. Time-sensitive candidates (type News, or flagged breaking/developing) open for **more than 6h** are closed as stale. Each gets a `stale` label and a comment with the reason; the branch and article are kept, and reopening the PR reconsiders it.
  - **What doesn't.** Explainer, Analysis, Review, Essay, Opinion and Ideas candidates don't expire this way, and held PRs are left alone.
  - **Kill switch off.** Stale candidates are only reported.
- **Social.** The card workflow dispatches the social publisher (`after_cards`) as soon as post-merge cards are stored. The publisher treats it exactly like the schedule: at most one story per run (a queued retry first, else the newest actionable story), ledger-backed, never a duplicate. The hourly :35 schedule is now only a backup/recovery sweep.
- **Tests.**
  - Unit: the 50-minute gap, and stale rules by type and flag.
  - Gate integration: stale News closed and kept, the fresher story merges instead, an old Explainer stays open, and dry runs only report.
  - Social: the after-cards dispatch wiring, and `--trigger cards` as a one-story sweep.

## 2026-10-01 — one-story-per-run: first scheduled verification

- **Verified on the first scheduled run (execution 951, 17:00:19 UTC, mode `production`, 46s).**
  - **Live version.** `5e78c5f1` (hourly plus the guard) is active.
  - **Candidates.** 5 queued and 5 accounted for: 1 `published` (Gaming, polygon.com, PR #216) and 4 `candidate_skipped`/`run_quota` (Variety, CNBC, DW, The Verge), skipped before any fetch or model call.
  - **Telemetry.** `reachedDrafting` 1, `rejected` 0, `unaccounted` 0.
  - **Gate.** Exactly one queued story merged in that hour (#210 at 17:01). #205 and #213 from before the change remain queued, at one per hour.

## 2026-10-01 — artifact branches never deploy on Vercel

- **Cause.** Every push to `social-assets` and `social-ledger` created a failed Vercel Preview deployment. Vercel reads `vercel.json` from the **pushed commit**, and these orphan branches (`cards/`, `shorts/`, `ledger/` only) have no copy of main's file, whose `git.deploymentEnabled` already lists both branches. Vercel therefore tried to build a non-app and errored.
- **Fix.** Each artifact branch now carries its own minimal `vercel.json`: `"git": {"deploymentEnabled": false}`, plus `"ignoreCommand": "exit 0"` as a second guard. The workflows that write these branches build on the existing tip, so the file persists.
- **Unchanged.** Main's `vercel.json`, the ignore script, production deployments and feature-branch previews.
- **Verified with the commit adding the file** (`93b18f3` on social-assets, `779d8bd` on social-ledger):
  - **0** Vercel deployments and no Vercel commit status, versus 1 failed deployment for each previous artifact push;
  - main still "Deployment has completed".

## 2026-10-01 — final handoff / maintainability pass

- **Docs.**
  - `docs/LIVE_STATE.md` is the read-first snapshot.
  - `docs/RUNBOOK.md` covers schedules, emergency switches, 17 failure playbooks, the credential inventory (names only), external approvals, the "breaks tonight" sequence, n8n restore, and checkpoint/rollback.
  - Stale claims are corrected in README, AGENTS.md, SOCIAL_DISTRIBUTION, RECOVERY and the n8n README.
- **Repository hygiene.**
  - "Clean up merged branches" (confirm yes, scope all) removed 130 merged branches: 172 → 42. Every remaining branch is explained in LIVE_STATE.
  - Docs PR #217 was folded in here and closed; #224 was merged directly.
  - No temporary key files remain; `.gitignore` covers `.env*` and the raw n8n exports.
- **n8n.** The live version `5e78c5f1` (69 nodes, active, hourly) equals `n8n/workflows/nuvellum-newsroom.json`.
- **Tests.**
  - Repo: 404/404.
  - Engines: 79 pass, 0 fail, 3 skipped (the opt-in real-Chromium card tests, which CI runs).
  - `validate` passes, including the n8n export check.
  - Build: 349 pages; the build-output check passes for 48 articles.
  - `npm audit`: 0 vulnerabilities (root and engines).
  - Production smoke: 387 checks, 0 failures.
- **Production.** 200 for home, article, Latest, World Desk, Saved, RSS (49 items), sitemap (96 URLs), robots, Brief unsubscribe and the search index. GA4 is present, the Brief form is present, and the World Desk shows only filed stories (Latin America shows the empty state).
- **Live chain on the 21:00 UTC cycle.** Execution 955 → #227 (one PR); the gate auto-merged #222 at the 60-min mark and closed #205 as stale; deploy `48f8abf`; cards `d4e3b32`; the social publisher was dispatched after cards; **Telegram https://t.me/nuvellum/21 at 21:03:19**; artifact-branch pushes created 0 Vercel deployments.
- **Checkpoint.** Tag `nuvellum-autonomous-v1`, on the merge commit of this handoff PR.
