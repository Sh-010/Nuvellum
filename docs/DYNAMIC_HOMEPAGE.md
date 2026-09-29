# Dynamic homepage and editorial art

The approved v5.1 ZIP remains the visual source of truth. The build does **not** replace its CSS, layout, motion system or section composition.

During each build (all steps write only to the gitignored `.build/public/`):

0. `scripts/prepare-public.mjs` copies the tracked `public/` folder to `.build/public/`.
1. `scripts/restore-v5.mjs` restores the checksum-pinned v5.1 homepage.
2. `scripts/generate-editorial-art.mjs` creates an original deterministic SVG illustration for each published automated story.
3. `scripts/render-editorial-home.mjs` renders the homepage from every published story. Placement is decided by `scripts/lib/home-selection.mjs` and depends only on date, section and type: a story published from the Editorial Desk (`origin: "manual"`) competes on equal terms with newsroom stories (`origin: "automation"`). (`scripts/inject-home-content.mjs`, the older v5.1 slot filler, is not part of the build; it follows the same all-origins rule.)
4. Astro builds article, latest, section, author, RSS and sitemap routes.

## Progressive replacement

Demo/seed stories remain as fallbacks until enough real published stories exist.

- Hero: the newest published World story, otherwise the newest published story (any origin).
- Under the hero: the newest story from each of three other sections, topped up with the newest remaining stories.
- Latest: the newest published stories not already shown in the hero row (up to five per filter), so no headline appears twice.
- World: real World stories replace the existing World cards first.
- Screen & Play: real Film & TV / Anime / Gaming stories replace demo cards when available.
- Opinion & Ideas: real Opinion / Essay / Ideas stories replace demo cards when available.

This lets Nuvellum become live gradually without creating empty sections or rebuilding the approved design.

## Editorial illustrations

Manual (Editorial Desk) stories show only the image recorded for them; with no image they are set text-led, never given generated art. Automated stories use their validated story-specific art at `/generated/ai/<slug>.svg` when n8n committed one, otherwise the build-time `/generated/<slug>.svg`.

These SVGs are generated locally from the article slug, section and headline. They use Nuvellum-owned abstract editorial motifs and do not copy source-site photography. This keeps the launch workflow copyright-safe and free of image-API costs.

A licensed or original photograph can later replace the generated artwork by changing the article image policy without changing article URLs or homepage layout.
