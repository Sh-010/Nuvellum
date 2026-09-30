# Nuvellum social card system

`engines/cards/` renders branded social assets for any published article, automatically and deterministically. There are no paid services and no network calls; the fonts are embedded. It **does not post anything**: the social publisher reads the manifest later.

```bash
node engines/cards/cli.mjs --slug <slug>                     # SVG cards + manifest
node engines/cards/cli.mjs --slug <slug> --png               # also PNGs via Chromium, with an overflow check
node engines/cards/cli.mjs --slug <slug> --variant breaking  # force a template (standard|breaking|analysis|culture)
node engines/cards/sample-qa.mjs                             # every fixture: render, rasterise, verify in Chromium
```

Output goes to `engines/out/social-cards/<slug>/` (gitignored). In GitHub Actions, install Chromium with `cd engines && npx playwright-core install --with-deps chromium`, as the Shorts workflow already does, then pass `--png`.

## Formats

| File | Size | Use | Safe zone |
| --- | --- | --- | --- |
| `square.svg` | 1080×1080 | X, Facebook, LinkedIn, Threads, Telegram feed | 72 px margins |
| `landscape.svg` | 1200×630 | link card / og:image, X large summary, Telegram | 60 px margins |
| `portrait.svg` | 1080×1350 | Instagram / Facebook feed | 72 px margins |
| `story.svg` | 1080×1920 | Stories, Reel/Short and TikTok covers | content only between y=250 and y=1600 (platform UI covers the rest); 80 px sides. The zones outside hold only marked decoration: a masthead double rule above (or the breaking band) and a large, faint N✦ monogram rising from the bottom edge. The composition is centred between header and footer, and the spine is 14 px. |
| `quote-square.svg`, `quote-portrait.svg` | 1080×1080, 1080×1350 | pull quote / key fact (only when the article has a suitable line) | as above |

## Templates (chosen automatically, or with `--variant`)

- **Standard News:**
  - the story's own image when it has one, with section, headline, the NUVELLUM✦ wordmark and nuvellum.news;
  - a text-led design otherwise.
- **Breaking / Developing:**
  - a dark wine band carrying the wordmark, a status dot with BREAKING or DEVELOPING, the section, and the time in GMT from `publishedAt`;
  - a bold, short-set headline.
  - Used **only** when the article says so (`breaking: true` / `developing: true`, or a `Breaking` / `Developing` tag); never inferred.
- **Analysis / Opinion / Ideas:**
  - text-led even when a photo exists, with a dominant headline and the dek;
  - `TYPE · SECTION` kicker;
  - an opening quote ornament for Opinion, Ideas and Essay;
  - a byline only for a named person (desk bylines are omitted as clutter).
- **Culture / Cinema / Gaming** (Culture, Film & TV, Gaming, Anime, Screen & Play…) **with a picture:** image-forward, with a larger picture panel. Still paper, ink and burgundy.
- **Quote / Key fact:**
  - one **verbatim** sentence from the article, a direct quote first, else a sentence with a figure;
  - it must stand alone (no "such deals", "they", "however…");
  - "From: <headline>" gives context.
  - **Never for sensitive stories.** A lone line strips allegations of context, and a casualty figure is not a promotional graphic.

## Design language

The site's own identity, not a social template:
- **Colour:** ivory paper `#F8F4EC`, ink `#17120F` and burgundy `#76132B`/wine `#54101F`, from the site's CSS tokens.
- **Typography:** the site's typeface **Newsreader** (OFL, `public/fonts`), embedded in each card so every machine renders it identically.
- **Brand marks:** the existing **N✦ monogram** and **NUVELLUM✦** wordmark, unchanged.
- **Details:** hairline rules, a burgundy spine, and small tracked uppercase labels. No gradients, no glow, no "breaking news" chyrons.

## Image logic (never a stand-in picture)

1. The story's own local raster photo (JPEG/PNG/WebP) → used, labelled **FILE PHOTO** on a solid chip, with the licence credit ("Photo: Author / CC BY…"). The credit comes from the frontmatter or `src/data/image-credits.json`.
2. The story's approved illustration (SVG) → used, labelled **ILLUSTRATION**.
3. Anything else (no image, missing file, remote URL, unknown type) → a **text-led** card. No fallback or section picture is ever inserted.

Text never sits on a photograph. The picture has its own panel, and only solid label chips sit on it, so contrast is guaranteed and faces or busy areas are never covered. Tall pictures (portraits of people) are cropped from the top so heads are kept, and a `focus` hint in the credits data (`top` / `bottom`) overrides that.

## Headline fitting

1. **Measure** with Newsreader advance widths measured in Chromium (`newsreader-metrics.json`; regenerate with `measure-font.mjs`), with 3% headroom for kerning.
2. **Size:** the largest size (in 2 px steps) between each template's maximum and minimum at which the headline fits its line budget and the available height. Budgets are 2–4 lines normally, 5 in the tall formats.
3. **Balanced breaks:** the narrowest measure that keeps the same line count, so lines come out even and never end on one word.
4. **Long headline layout:** a second, smaller band with one or two extra lines.
5. **Photo cards shrink the picture** (to about 64%) before the type gets small. If a photo card still can't set the headline at a legible size (44 px square, 48 portrait, 34 landscape, 56 story) or would clip it, that card switches to the text-led layout. The manifest records `imageDropped`.
6. **Last resort:** at the long layout's minimum size, the last line ends with "…" and the manifest records `clipped: true`. Only a synthetic 272-character test headline reaches this.

Every text line records its measured width and allowed box (`data-w`, `data-box`). The tests check them with the metrics, and `sample-qa.mjs` / `cli --png` check them in the real renderer.

## Manifest (`manifest.json`)

```json
{
  "version": 2,
  "slug": "…",
  "url": "…",
  "title": "…",
  "section": "…",
  "variant": "standard",
  "media": { "mode": "photo", "label": "FILE PHOTO", "credit": "Photo: …", "usedBy": ["square", "landscape", "portrait", "story"] },
  "quote": { "kind": "fact", "text": "…" },
  "assets": [
    { "format": "square", "width": 1080, "height": 1080, "variant": "standard", "image": "photo",
      "headline": { "size": 64, "lines": 3, "layout": "normal", "clipped": false },
      "path": "engines/out/social-cards/<slug>/square.svg", "use": "…", "safeZone": { … } }
  ],
  "clipped": false,
  "square": "…", "portrait": "…", "landscape": "…", "story": "…", "sourceMode": "photo"
}
```

The `square` / `portrait` / `sourceMode` keys keep the v1 distribution drafts working. With `--png`, each asset also gets a `png` path.

## Used by the social publisher

`engines/publish/assets.mjs` calls this renderer automatically before an image platform is posted to. It rasterises in Chromium, runs the overflow check and maps platforms to cards; Telegram uploads the square card. See "Social cards in the publisher" in `docs/SOCIAL_DISTRIBUTION.md`.

## Review samples

Contact sheets rendered from the fixtures (`engines/cards/fixtures.mjs`): `docs/social-cards/*.jpg`.
