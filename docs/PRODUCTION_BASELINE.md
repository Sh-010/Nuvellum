# Nuvellum v5.1 Production Baseline

The approved homepage design is the exact archive at `assets/nuvellum-v5.zip`.

## Non-negotiable rule

Do not recreate the homepage in `src/pages/index.astro`. The build intentionally fails if that route exists because Astro would override the approved static homepage.

The build script `scripts/restore-v5.mjs` verifies the v5.1 archive checksum, extracts the exact design into the build-only `.build/public/` directory (never the tracked `public/` folder), and then applies only non-visual production bridges: canonical/OG/Twitter metadata, real route destinations, live search-index integration, and duplicate-indexing protection for the legacy `article.html` demo.

## Recovery points

- `backup-pre-v51-2026-09-25`: snapshot of the pre-restoration Astro homepage.
- `nuvellum-v5.1-production-baseline`: first verified live deployment of the exact uploaded v5.1 design.

## Content workflow

Published Markdown stories live in `src/content/articles/`. Astro automatically builds article routes, section routes, the search index, RSS and sitemap from this content. Homepage editorial slots remain visually fixed to v5.1; their production links are mapped by title in `scripts/restore-v5.mjs` so the design does not need to be rewritten when routing changes.

## Intentional changes allowed around the baseline

SEO metadata, route destinations, accessibility fixes, security headers, search data, article content and backend integrations may evolve. Changes to homepage layout, typography, spacing, motion, color, card composition, quick-chip behavior or responsive design require explicit visual approval first.
