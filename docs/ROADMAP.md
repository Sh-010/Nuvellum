# Nuvellum master roadmap

Non-negotiable across every milestone: **preserve the approved Nuvellum v5.1 visual design.** Work improves function, reliability, automation, accessibility, SEO, performance, publishing, distribution, analytics and observability. It is not a visual reinvention. Current state and history live in `WORKLOG.md`.

| Milestone | Scope | Status |
|---|---|---|
| **M1: Core stable** | Site works, story navigation, newsroom end-to-end, release gates and production health | ✅ **Met, unattended since 2026-10-01.** n8n v6.5 is active and runs every 3 hours: scheduled execution 950 ran at 15:00 UTC with nobody involved. `NUVELLUM_AUTOPUBLISH` is `on`, and the publication gate auto-merged #204, #206, #207, #211 and #212 with every editorial, verification and branch-protection rule intact. Production deploys followed. |
| **MV: Visual system** | Story-specific editorial imagery with safe fallback | ✅ **Operational v1.** Incoming stories get a conservative Wikimedia/representative-image pass, licensing metadata and text-led fallback. A future paid/multi-provider generative-image layer is optional, not a launch dependency. |
| **M2: Discovery ready** | SEO, RSS, sitemap, analytics, accessibility and performance | ✅ **Met.** Sitemap (85 URLs), RSS and robots are live. GA4 `G-MYKD3ELQTN` was verified on production on 2026-10-01: nothing loads before consent, exactly one `page_view` with the correct `page_type`, no PII, and UTM attribution works. The Search Console domain property is verified (the sitemap is referenced in robots.txt). |
| **M3: Distribution ready** | Social engine, cards, adapters, grounding, idempotency | 🟡 **Telegram live; other platforms built and blocked only externally.** Branded cards are generated automatically after every publication. Telegram posts from the scheduler with ledger idempotency. The Facebook, Instagram (JPEG card), Threads and LinkedIn adapters are built and record `skipped`/`blocked` until credentials and platform app reviews exist; see SOCIAL_PLATFORM_SETUP.md. X stays off (paid). |
| **M4: Video ready** | Shorts/Reels pipeline renders grounded production assets | ⏸ **Fallback only (owner decision, 2026-10-01).** The still-image narrated renderer works end to end and was verified on 2026-10-01, but it is not the intended video product. It has no schedule and no automatic public posting (`NUVELLUM_SHORTS_PUBLISH` is not set). The future product is a generative-video engine with genuinely moving scenes; it is deferred. |
| **M5: Operations ready** | Monitoring, recovery, source management, provider fallback, security | ✅ **Operational, with owner alerts.** CI/security gates, six-hourly observability, production smoke checks (344 checks, 0 failures on 2026-10-01) and owner alerts. Alerts open an `ops-alert` issue that @-mentions the owner and close themselves; both rehearsal alerts did. |
| **M6: Expansion ready** | Newsletter and monetization plumbing | 🟡 **Brief unattended; monetisation deferred.** The Brief runs on off-peak cron with idempotent backups (the 06:00 run had never fired). A dry run on 2026-10-01 found 3 real recipients and 0 QA. Ads stay off. |

---

## Post-launch editorial/product backlog

Deferred product ideas—original analysis/essays, author pages, article audio, selective interactives, personalised Brief preferences, community, and signature Nuvellum editorial products—are captured in [POST_LAUNCH_EDITORIAL_BACKLOG.md](POST_LAUNCH_EDITORIAL_BACKLOG.md). They are intentionally out of scope until the launch stack operates reliably on its own.

## Core freeze after stabilization

The approved production experience is now treated as a stable baseline. Do not casually redesign or rewrite working interaction systems while adding distribution, analytics or monetisation.

- Functional fixes must preserve the approved visual language unless the owner explicitly asks for a design change.
- Any homepage/content-placement change must pass the repository test suite plus the live production smoke audit after deployment.
- Distribution, Brief, Shorts, analytics and monetisation failures must remain non-blocking for article publication unless a safety/editorial gate itself fails.
- New feature work should be isolated from the core where possible and should not create another parallel "version" of the site.


## MV: AI Visual Engine

### Goal
Automatically produce premium, distinctive, publication-quality editorial imagery for each story, while preserving factual integrity, safety, performance and Nuvellum's visual identity. The current deterministic art stays as the guaranteed fallback. It is not the final visual standard.

### What exists today (baseline to improve, not replace)
- **Primary:** Gemini generates one inline SVG per story in n8n (`Gemini Editorial SVG`). `Sanitize Editorial SVG` strips unsafe content and re-checks it against an element allowlist. The repository validator (`scripts/lib/svg-safety.mjs`) re-checks the committed `public/generated/ai/<slug>.svg`.
- **Fallback:** section artwork under `/images/`, plus the build-time procedural art from `scripts/generate-editorial-art.mjs`.
- **Limits:** a single candidate with no quality scoring, SVG only, no visual brief, one size, no social or video derivatives, and the provider is hard-wired to Gemini.

### Pipeline
```
approved article
 → visual brief            (structured, derived from the article, never just the headline)
 → visual mode selection   (illustration | enhanced procedural | photo-based | data/diagram | fallback SVG)
 → N candidates            (image-provider chain)
 → visual QA + scoring     (automatic; reject below threshold)
 → best valid candidate    (else fallback)
 → Nuvellum treatment      (brand system: crop, grade, mark rules)
 → asset optimization      (AVIF/WebP + fallback, responsive sizes, per-surface crops)
 → publish with article    (never blocks publication)
 → derivatives             (OG/social, Instagram, X, Facebook, newsletter, Shorts scenes)
```

### Visual brief (per story)
Subject; central event or idea; location; people and entities; emotional tone; section; possible visual metaphors; **factual constraints**; **things that must not be depicted inaccurately** (flags, maps, logos, uniforms, casualties); whether real, identifiable people are involved; whether a literal or conceptual treatment is appropriate; required aspect ratios. The brief is stored with the asset so any image can be regenerated or audited.

### Visual modes
1. **AI editorial illustration:** conceptual, story-specific, section-aware art direction. Not stock-like.
2. **Enhanced procedural art:** the upgraded SVG system, with stronger composition and geometry, lighting, depth and texture, and restrained typography where appropriate.
3. **Photo-based enhancement:** only where legally and technically appropriate (licensed or owned source imagery). It is always distinguishable from documentary photography and never fabricated.
4. **Data or diagram visuals:** maps, timelines and simple explanatory graphics or charts, only when the story genuinely benefits.
5. **Fallback SVG:** the current safe deterministic system. Used when providers fail, quota runs out, safety checks fail or quality is below threshold.

### Factual safety (hard rules)
- For sensitive or news stories, images must not imply events that the reporting does not support.
- Never generate a photorealistic depiction of an event that was not photographed and present it as documentary evidence.
- No photorealistic depiction of identifiable real people in invented situations.
- Every AI image carries an editorial-illustration label. The article caption already reads "NUVELLUM · AI-generated editorial illustration".
- Sensitive stories default to conceptual or symbolic modes; literal depiction of victims, violence or disaster scenes is excluded.

### Visual QA and selection
Score each candidate on relevance, composition, technical quality, factual safety, brand consistency, artifact level (malformed anatomy, nonsense text, obvious AI tells), headline compatibility and mobile-crop quality.

Reject:
- generic stock looks;
- excessive symbolism;
- sensationalism;
- misleading depictions;
- inaccurate flags, maps or logos;
- falsely realistic events.

Generate several candidates and pick the strongest valid one. If none meets the threshold, use the fallback art. Scores and reasons are logged with the story for observability.

### Image-provider abstraction
- Mirrors the text-model provider layer on `engines/distribution-shorts` (`engines/shared/providers/*`): configurable, ordered provider chains per role (for example `NUVELLUM_ROLE_IMAGE`, `NUVELLUM_ROLE_IMAGE_QA`), so models can be swapped without code changes.
- Handles authentication failures, timeouts, quota exhaustion and 429s (with backoff), outages, malformed responses and safety refusals, each falling through to the next provider and finally to the fallback SVG.
- Keys never appear in logs, exports or the repository.

### Asset pipeline
- Versions: article hero, homepage hero, story card, Open Graph/social share, Instagram, X, Facebook, Shorts scenes.
- Formats: AVIF and WebP with a safe fallback. Responsive sizes with explicit dimensions (no oversized downloads, no layout shift).
- Originals and briefs are preserved for regeneration.
- **Storage decision required before build:** committing raster images to Git inflates the repository. Options are Git with size limits, Vercel Blob or another object store, or build-time optimization of a small committed master. This is an owner decision because it involves cost.

### SEO and accessibility
Meaningful, story-specific alt text (no keyword stuffing), explicit image dimensions, correct `og:image` dimensions and type, and image data in the Article JSON-LD.

### Brand system
A machine-readable visual direction document (for example `docs/visual-direction.json` plus a readable companion) covering: composition, lighting, editorial tone, acceptable abstraction, section-by-section differences, typography inside imagery, Nuvellum mark usage, colour relationship to the v5.1 palette, and unacceptable styles. It feeds the brief, the prompts and the QA scorer. **The website design does not change.**

### Integration rules
- The engine must **never block publication indefinitely**:
  - AI success → premium image;
  - failure → retry the next provider;
  - all providers fail → current safe SVG fallback → publish normally.
- Assets are later reused by the Distribution Engine (M3), Open Graph, the newsletter (M6) and the Shorts engine (M4).
- It stays out of the editorial gates: a visual failure can never weaken or bypass `editorialReview` or `verification`.

### Acceptance test
Run the premium path and the current SVG fallback side by side on materially different real stories: politics/world, technology, entertainment, sports, and disaster/breaking news. Judge the **actual visual result** (relevance, quality, safety, brand fit, mobile crop), not just whether an API returned an image. Record the comparison with the images in the WORKLOG. MV is complete only when the premium path is visibly better and the fallback path is proven to take over cleanly.

### Dependencies to resolve before building MV
1. **Image generation provider credentials and budget.** The existing Gemini key may cover Google's image models. Anything else needs a key and a spend limit from the owner.
2. **Asset storage choice** (see Asset pipeline).
3. **Autopublish decision (M1).** It decides whether visuals must be produced unattended from day one.
