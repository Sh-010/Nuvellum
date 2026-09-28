# Editorial SVG prompt notes

Version: 2026-09-28. Validator: `scripts/lib/svg-safety.mjs` (snippet `validate-svg.js`).

- Abstract, symbolic editorial illustration. No photorealistic people, logos, real brand marks or text beyond the NUVELLUM wordmark and section label.
- Output one `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">` document.
- Allowed: shapes, paths, gradients, patterns, clip paths, masks, filters (feGaussianBlur, feTurbulence and similar), `<text>`, `<style>` with local rules only.
- Forbidden: `<script>`, event attributes, `<foreignObject>`, `<image>`, `<a>`, `<iframe>`, animation elements, any `http(s)://`, `//`, `data:` or `javascript:` value, `url()` pointing anywhere except `#id`, DOCTYPE, entities.
- If validation fails, **commit no art** and use the section image. Do not try to repair the SVG.

## Nuvellum house style

- The illustration must look like a restrained international newspaper/magazine commission, not generic AI art.
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
