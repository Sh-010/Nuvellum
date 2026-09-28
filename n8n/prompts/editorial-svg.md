# Editorial SVG prompt notes

Version: 2026-09-28. Validator: `scripts/lib/svg-safety.mjs` (snippet `validate-svg.js`).

- Abstract, symbolic editorial illustration. No photorealistic people, logos, real brand marks or text beyond the NUVELLUM wordmark and section label.
- Output one `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">` document.
- Allowed: shapes, paths, gradients, patterns, clip paths, masks, filters (feGaussianBlur, feTurbulence and similar), `<text>`, `<style>` with local rules only.
- Forbidden: `<script>`, event attributes, `<foreignObject>`, `<image>`, `<a>`, `<iframe>`, animation elements, any `http(s)://`, `//`, `data:` or `javascript:` value, `url()` pointing anywhere except `#id`, DOCTYPE, entities.
- If validation or the style gate fails, **commit no art** and use the Nuvellum house plate `/uploads/house/<section>.svg`. Do not try to repair the SVG.

## Nuvellum house style

- The illustration must look like a restrained international newspaper/magazine commission, not generic AI art.
- Paper-toned ground: a warm ivory/cream background across the full canvas, never a dark one.
- Use an editorial-print palette anchored in ivory, charcoal, stone and dark burgundy. Other muted story-specific colors are allowed, but keep the composition restrained.
- Prefer one clear visual metaphor, strong negative space, elegant geometry, subtle depth and quiet texture.
- Maximum roughly three dominant colors plus neutrals.
- Favor paper, ink, engraving, cut-paper, architectural, diagrammatic or painterly-vector language over glossy 3D-tech imagery.
- For Gaming/Technology stories, **do not default to cyberpunk aesthetics**.

### Hard aesthetic rejects

Reject/regenerate if the result uses any of these as its main visual language:
- neon cyan + magenta/purple pairing;
- glowing holograms, glowing UI panels, HUDs, scanner grids or fake interfaces;
- random circuitry/network nodes/particles;
- generic futuristic silhouettes;
- lens-flare-like glows or nightclub lighting;
- fake screenshots, fake game UI, fake brand marks, fake character models;
- decorative complexity that does not explain the story.

The visual should still feel appropriate beside Nuvellum's cream paper, serif typography and burgundy rules when shown at hero size.

## Image policy and style gate

Live in the `Gemini Editorial SVG` prompt and the `Sanitize Editorial SVG` node (workflow 8hXx6NuZuJU9dRR1).

1. **Real image first.** `visual-acquire.yml` runs on every `incoming/**` branch and replaces the story image with an openly licensed Commons photo when one clears the threshold (`docs/VISUAL_ACQUISITION.md`).
2. **House plate.** Otherwise the story keeps `/uploads/house/<section>.svg` (drawn by `scripts/visual/house-visuals.mjs`). The imageAlt is `Nuvellum <Section> section illustration`, and `imageGenerationMode` is `house-fallback`.
3. **Generated SVG** replaces the plate only when it passes the safety checks and `styleProblems()`, which rejects:
   - any saturated cyan, magenta or purple;
   - `feGaussianBlur` alongside bright saturated colour (glow);
   - a dark full-bleed canvas (solid or gradient, mean lightness < 25%);
   - more than 18 tiny circles (particles);
   - 5+ rounded panel rects (UI/HUD);
   - fewer than 14 drawn shapes (low detail);
   - more than 4 saturated hue families;
   - a palette where under 60% of colours sit in the ivory/charcoal/stone/burgundy range.

   The rejection reason is kept in `aiImageError`.

Calibration (2026-09-28): the gate rejected all 21 AI SVGs the newsroom had committed and passed every Nuvellum illustration and house plate except the sparse science plate (detail count only; plates are fixed assets and never gated).
