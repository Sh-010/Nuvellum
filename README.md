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

- Start here (agents and engineers): `AGENTS.md`; architecture: `docs/ARCHITECTURE.md`
- Publishing policy and automation: `docs/EDITORIAL_PIPELINE.md`
- Distribution and Shorts engines: `docs/ENGINES.md`; recovery: `docs/RECOVERY.md`
- n8n workflow contract and version control: `n8n/README.md`
- Automation publishing contract: `docs/N8N_PUBLISHING.md`
