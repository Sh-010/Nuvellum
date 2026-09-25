# Dynamic homepage and editorial art

The approved v5.1 ZIP remains the visual source of truth. The build does **not** replace its CSS, layout, motion system or section composition.

During each build:

1. `scripts/restore-v5.mjs` restores the checksum-pinned v5.1 homepage.
2. `scripts/generate-editorial-art.mjs` creates an original deterministic SVG illustration for each published automated story.
3. `scripts/inject-home-content.mjs` fills existing v5.1 story slots with published automated stories.
4. Astro builds article, latest, section, author, RSS and sitemap routes.

## Progressive replacement

Demo/seed stories remain as fallbacks until enough real published stories exist.

- Hero: newest published automated World story, otherwise newest automated story.
- Hero side: other recent automated stories, with untouched demo cards filling empty slots.
- Latest: up to four automated stories, then demo fallbacks.
- World: real World stories replace the existing World cards first.
- Screen & Play: real Film & TV / Anime / Gaming stories replace demo cards when available.
- Opinion & Ideas: real Opinion / Essay / Ideas stories replace demo cards when available.

This lets Nuvellum become live gradually without creating empty sections or rebuilding the approved design.

## Editorial illustrations

Automated stories use `/generated/<slug>.svg`.

These SVGs are generated locally from the article slug, section and headline. They use Nuvellum-owned abstract editorial motifs and do not copy source-site photography. This keeps the launch workflow copyright-safe and free of image-API costs.

A licensed or original photograph can later replace the generated artwork by changing the article image policy without changing article URLs or homepage layout.
