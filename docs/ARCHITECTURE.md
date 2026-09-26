# Nuvellum system architecture

As of 2026-09-26. Companion documents:

- `AGENTS.md`: rules and the repository map
- `docs/EDITORIAL_PIPELINE.md`: publication policy
- `docs/ENGINES.md`: distribution and Shorts
- `docs/RECOVERY.md`: rollback procedures
- `n8n/README.md`: the n8n workflow contract

## 1. Overview

```
RSS (~27 approved sources, docs/SOURCE_MATRIX.md)
  │  n8n newsroom (canonical export: n8n/workflows/, snippets: n8n/snippets/)
  ▼
normalize-candidates ─ canonical URL, drop live blogs/video/no-URL, in-run dedupe
  ▼
duplicate check ─ vs /search-index.json and in-flight incoming/** branches
  ▼
fetch + extract source ─ skip thin sources (no padding)
  ▼
draft (model A) ─▶ editorial review (model B) ─▶ parse-review (fail closed)
  ▼                                   └─ risk: low | sensitive
sensitive? ─▶ independent verification (10 criteria) ─▶ parse-verification
  ▼
editorial SVG ─▶ validate-svg (drop art if unsafe → section image)
  ▼
build-article (status derived from review/verification) ─▶ deterministic branch
  ▼
GitHub: create incoming/<slug>-<hash8>, commit article (+ public/generated/ai/<slug>.svg)
  │   push by n8n's own credential ⇒ checks run on the exact commit
  ▼
Build Nuvellum · Security checks · CodeQL · Editorial duplicate guard
  ▼
auto-open-editorial-pr.yml (audit trail)
  ▼
auto-publish.yml ─ publication gate (scripts/lib/editorial.mjs), merge pinned to SHA
  ▼
main ─▶ Vercel production deploy ─▶ homepage / latest / section / RSS / sitemap
  ▼
distribution.yml (after publication, never blocking): Shorts render → social adapters
```

## 2. Site

- **Framework:** Astro 7, static output (`astro.config.mjs`). Deployed by Vercel's Git integration from `main`, build command `npm run build`, Node 22.
- **Build pipeline** (`package.json` → `build`):
  1. `validate-content.mjs`: schema, safety, duplicates, publication policy, AI SVG safety.
  2. `check-n8n-exports.mjs`: no secrets in committed n8n exports.
  3. `build-n8n-snippets.mjs --check`: snippets match their tested libraries.
  4. `prepare-public.mjs`: copy tracked `public/` to the gitignored `.build/public/`.
  5. `restore-v5.mjs`: checksum-verify and extract the v5.1 zip into `.build/public/`, then add routing and SEO bridges only.
  6. `generate-editorial-art.mjs`: deterministic fallback SVGs for automated stories.
  7. `inject-home-content.mjs`: fill the existing v5.1 homepage slots with published automated stories.
  8. `astro build` with `publicDir: .build/public`.
- A build **never writes to tracked files**. CI fails if `git status` is dirty afterwards.
- **v5.1 design lock:** see `docs/PRODUCTION_BASELINE.md`. The homepage is the archive's `index.html`, not an Astro page.
- **Security:** CSP and security headers in `vercel.json`. Article bodies are Markdown only; raw HTML is rejected. AI SVGs pass an allowlist validator and render as `<img>`.

## 3. Content schema

Frontmatter is one `key: value` per line; strings are JSON-quoted and arrays are JSON.

- **Machine contract:** `docs/article-payload.schema.json`.
- **Required:** `title dek section type author date readingTime image imageAlt status tags`.
- **Automated stories also carry:** `sourceUrls origin risk sourceNote editorialReview`, plus, when sensitive, `verification reviewedBy`. `publishedAt` (ISO 8601) is optional and orders same-day stories.
- `status`: `draft | review | published`. Only `published` renders.
- **Sections:** World, Business, Technology, Science, Crime, Sports, Culture, Film & TV, Anime, Gaming, Opinion.
- **Types:** News, Analysis, Explainer, and the human-led Opinion, Essay, Ideas and Review. Automation cannot publish human-led types.

## 4. Publication gate

`scripts/lib/editorial.mjs` `evaluatePublication()` is the single decision function. The rules are in `docs/EDITORIAL_PIPELINE.md`.

Main properties:

- It runs from the default branch only and never executes PR code.
- It judges each required check by its latest **executed** run on the exact head SHA. `action_required` runs are ignored: GitHub parks `pull_request` runs on bot-opened PRs there.
- Its merge is pinned to the evaluated SHA.
- Kill switches: the `NUVELLUM_AUTOPUBLISH` variable and the `hold` label.

## 5. Multi-model design

Model jobs ("roles") map to ordered provider chains through the `NUVELLUM_ROLE_<ROLE>` variables. Roles: draft, review, verify, social, shorts_script, shorts_verify. Providers: Gemini, Anthropic, OpenAI, and mock for tests.

- If a provider is missing or failing, the next in the chain is tried. If none is available, callers fall back to deterministic behaviour (templates, extractive scripts) or fail closed (review and verification).
- **Independence:** draft and verify should be served by different providers or models. `sameFirstProvider()` detects when they aren't.
- **In n8n today:** Gemini drafts, reviews and makes the SVGs. Claude (or OpenAI) can be added as the reviewer or verifier by changing the model node and keeping the same prompt and parser (`n8n/prompts/`).
- Nuvellum must not depend on any single vendor. Every model step has a deterministic fallback or a fail-closed outcome.

## 6. Environment

All names are in `.env.example`. Where each kind of value lives:

- **n8n credential store:** Gemini key; GitHub fine-grained token (Nuvellum repo only, Contents read/write). Planned: Anthropic or OpenAI keys.
- **GitHub Actions secrets:** model keys, TTS keys, social tokens.
- **GitHub Actions variables:** `NUVELLUM_AUTOPUBLISH`, `DISTRIBUTION_LIVE`, the `NUVELLUM_ROLE_*` chains, `NUVELLUM_TTS`, and non-secret platform IDs.
- **Vercel:** `SITE_URL` (set it when a custom domain is added).

## 7. Deployment and branches

- `main` is production, deployed by Vercel.
- `incoming/<slug>-<hash8>` branches hold automated candidates, one per source.
- Recovery points: `backup-pre-v51-2026-09-25`, `nuvellum-v5.1-production-baseline`, `checkpoint/pre-stabilization-2026-09-26` and the tag `checkpoint-pre-stabilization-2026-09-26`.

## 8. Adding things

- **A new RSS source:** add it to the n8n RSS merge and to `docs/SOURCE_MATRIX.md` with its desk and a routing hint. Check that its article URLs are not live-blog, video or gallery pages (`isAggregatePage`), and that its tracking parameters are covered by `TRACKING_PARAM_RE` in `scripts/lib/newsroom.mjs`.
- **A new social platform:**
  1. Add `engines/distribution/adapters/<id>.mjs` with `{ id, needs, env, isConfigured, publish }`.
  2. Register it in `adapters/index.mjs` and `platforms.mjs`.
  3. Add a template in `copy.mjs`.
  4. Add a mock-server test in `engines/tests/distribution.test.mjs`.
  5. List its env names in `.env.example` and `distribution.yml`.
- **A new model provider:** add `engines/shared/providers/<id>.mjs` with `{ isConfigured, defaultModel, complete }` and register it in `providers/index.mjs`. Add a request-shape test in `engines/tests/providers.test.mjs`. Document its env names.
- **A new TTS voice:** add an entry to `TTS` in `engines/shorts/tts.mjs`.
