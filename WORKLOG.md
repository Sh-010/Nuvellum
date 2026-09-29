# Nuvellum engineering worklog

Append new entries at the top. Record what changed, the commits, the tests with their results, blockers, and anything that needs the owner.

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
