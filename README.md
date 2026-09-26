# Nuvellum

**Beyond the headline.**

Production Astro build of the Nuvellum international digital publication.

Live site: https://nuvellum.vercel.app

## Local development
```bash
npm install
npm run dev
```

## Production
```bash
npm ci
npm test
npm run build
npm run preview
```

The site is fully static and deployed from GitHub to Vercel. Articles live in `src/content/articles/` as Markdown.

Builds never modify tracked files. The served public assets are assembled in `.build/public/`, which is gitignored: the tracked `public/` folder, plus the checksum-pinned v5.1 design, generated art and homepage injection.

- Publishing policy and automation: `docs/EDITORIAL_PIPELINE.md`
- n8n workflow contract and version control: `n8n/README.md`
- Automation publishing contract: `docs/N8N_PUBLISHING.md`
