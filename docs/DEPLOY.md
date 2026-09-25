# Deployment

Cloudflare Pages settings:
- Framework preset: Astro
- Build command: `npm run build`
- Output directory: `dist`
- Node version: 22
- Environment variable: `SITE_URL=https://your-domain.example`

Connect the GitHub repository in Cloudflare Pages. Every commit to `main` deploys automatically. Preview branches can be enabled for editorial testing.
