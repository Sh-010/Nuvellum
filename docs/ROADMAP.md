# Nuvellum master roadmap

Non-negotiable across every milestone: **preserve the approved Nuvellum v5.1 visual design.** Work improves function, reliability, automation, accessibility, SEO, performance, publishing, distribution, analytics and observability. It is not a visual reinvention. Current state and history live in `WORKLOG.md`.

| Milestone | Scope | Status |
|---|---|---|
| **M1: Core stable** | Site works, story navigation, newsroom end-to-end, 3/3 clean production runs, no known release blocker | ✅ Met 2026-09-27 (runs 912, 914, 915 → #58, #60, #61). Autopublish is still OFF, pending the owner's decision. |
| **MV: AI Visual Engine** | Premium, story-specific editorial imagery with safe fallback (spec below) | Planned; next after M1 |
| **M2: Discovery ready** | SEO, RSS, sitemap, analytics, accessibility and performance | Partly done: canonical, OG/Twitter, Article JSON-LD (ingestion sources deliberately not published), sitemap `lastmod`, RSS, Lighthouse 98/84/100/100. Remaining: analytics, the v5.1 design-level a11y items. |
| **M3: Distribution ready** | Social engine, adapters, grounding, idempotency, dry-run default | Code exists on `engines/distribution-shorts`, not in main. Consumes MV assets. |
| **M4: Video ready** | Shorts pipeline renders grounded, production-quality output | Prototype on `engines/distribution-shorts`. Consumes MV assets. |
| **M5: Operations ready** | Monitoring, recovery, source management, provider fallback, security | Partly done: recovery docs, source matrix, CI gates, secret scan |
| **M6: Expansion ready** | Newsletter and monetization plumbing, platform integrations awaiting credentials | Not started |

---

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
