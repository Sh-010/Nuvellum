# Editorial SVG prompt notes

Version: 2026-09-26. Validator: `scripts/lib/svg-safety.mjs` (snippet `validate-svg.js`).

- Abstract, symbolic editorial illustration. No photorealistic people, logos, real brand marks or text beyond the NUVELLUM wordmark and section label.
- Output one `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">` document.
- Allowed: shapes, paths, gradients, patterns, clip paths, masks, filters (feGaussianBlur, feTurbulence and similar), `<text>`, `<style>` with local rules only.
- Forbidden: `<script>`, event attributes, `<foreignObject>`, `<image>`, `<a>`, `<iframe>`, animation elements, any `http(s)://`, `//`, `data:` or `javascript:` value, `url()` pointing anywhere except `#id`, DOCTYPE, entities.
- If validation fails, **commit no art** and use the section image. Do not try to repair the SVG.
