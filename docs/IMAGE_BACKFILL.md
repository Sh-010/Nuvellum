# Article image backfill

Upgrades weak art on published articles and keeps its credits honest. The script is repeatable.

## Commands

```bash
npm run images:audit                 # classify every published image; lists WEAK entries
npm run images:backfill              # apply src/data/image-plan.json to articles not yet applied
node scripts/backfill-article-images.mjs --apply --only slug-a,slug-b --refresh   # re-fetch specific entries
```

Image classes: `real` (photo in `/uploads/articles/`), `illustration` (Nuvellum SVG in `/uploads/articles/`), `house` (Nuvellum section plate in `/uploads/house/`), `ai-svg` (newsroom `/generated/ai/`), `procedural` (automation fallback) and `section-placeholder` (`/images/<section>.svg`). `ai-svg`, `procedural` and `section-placeholder` count as weak and need a plan entry.

## Order of preference

1. An openly licensed real photograph from Wikimedia Commons: public domain, CC0, CC BY or CC BY-SA. Never NC or ND.
2. The same photograph with a recorded focal point (`focus`, a CSS `object-position`) when the default crop fails.
3. A Nuvellum-drawn illustration. Opinion & Ideas uses these rather than stock-like photos.
4. The Nuvellum house plate for the section (`/uploads/house/<key>.svg`, plan `source: "illustration"`), when no real photo is strong or safe enough, for example when the only Commons match is a different person with the same name.

Generated AI art is no longer kept as a hero: neon, hologram, HUD, particle and generic-AI illustrations are replaced. New generated art has to pass the newsroom style gate (`n8n/prompts/editorial-svg.md`). Regenerate the plates with `node scripts/visual/house-visuals.mjs`.

## What the script does

For each plan entry it:
- resolves the Commons file and rejects any licence that isn't open;
- downloads the 1280px thumbnail to `public/uploads/articles/<slug>.jpg`;
- writes author, licence, source page, caption and focus to `src/data/image-credits.json`;
- changes only the article's `image` and `imageAlt` frontmatter lines.

Everything else in the article, including `sourceUrls` and review metadata, is untouched. Requests are paced and retried, because Commons rate-limits bursts.

## Presentation

- Article lead captions show the plan caption and "Photo: author / Wikimedia Commons, licence", linked to the file page and the licence.
- Captions label photos of other events as **File photo**.
- `/credits` lists every image. The homepage and interior cards apply `focus`.
- `tests/image-backfill.test.mjs` fails if a credit points at a missing file or a closed licence, or if a published article falls back to weak art without a plan.

## Choosing images

Search Commons and review candidates visually at the site's crops before adding a plan entry. The ratios are hero ~1.84:1, Latest thumbnail 2.3:1, cards 16:10, article lead 16:9 and square.

For sensitive stories, prefer neutral places over people, and never show victims.
