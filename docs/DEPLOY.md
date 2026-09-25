# Deployment

## Current production

Nuvellum is deployed on Vercel at:

`https://nuvellum.vercel.app`

The Vercel project is connected to `Sh-010/Nuvellum` and deploys from the `main` branch.

## Build settings

- Framework preset: Astro
- Build command: `npm run build`
- Output directory: `dist`
- Node version: 22
- Canonical site URL: `https://nuvellum.vercel.app`

When a custom domain such as `nuvellum.news` is purchased and connected, update `SITE_URL` in Vercel and this repository so canonical URLs, sitemap, RSS and Open Graph metadata use the custom domain.
