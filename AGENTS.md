# Nuvellum — guide for AI agents and engineers

Read this before changing anything. It replaces months of chat history.

Nuvellum (https://nuvellum.vercel.app, "Beyond the headline.") is an automated international digital news publication. It has **no permanent human copy desk**, so correctness is enforced by code: validators, a publication gate and fail-closed parsers.

## Hard rules

1. **Do not redesign the site.** The approved design is the v5.1 archive `assets/nuvellum-v5.zip`, pinned by SHA-256 in `scripts/restore-v5.mjs`. Do not edit the zip, its checksum, the homepage markup, CSS, motion, typography or layout, and do not create `src/pages/index.astro` (the build fails if it exists). Visual changes need explicit approval from the owner, Sam (GitHub `Sh-010`).
2. **Do not rewrite published articles** for cleanup. Corrections go through the corrections policy.
3. **Never commit secrets.** Keys live in the n8n credential store, GitHub Actions secrets, or local `.env` files that are never committed. Refer to them by name only (see `docs/ARCHITECTURE.md#environment`).
4. **Never force-push, rewrite history, or delete** `backup-*`, `checkpoint*` or `nuvellum-v5.1-production-baseline` branches and tags.
5. **Patch the existing system in place.** Don't create new workflow versions (v6.5, v6.6, …) for isolated bugs.
6. **Checkpoint before risky changes:** tag or branch `main` first, then work on a feature branch.
7. **Fail closed.** If a review, verification, parse or check is uncertain, the story does not publish.

## Map

| Path | What |
| --- | --- |
| `src/content/articles/*.md` | Articles (Markdown + flat frontmatter). Source of truth for the site. |
| `src/pages`, `src/lib`, `src/styles` | Astro routes (article, section, author, latest, RSS, sitemap, search index). |
| `assets/nuvellum-v5.zip` | **Locked** v5.1 homepage + article template. |
| `scripts/` | Build pipeline, validator, publication gate, duplicate guard, tools. |
| `scripts/lib/editorial.mjs` | **Publication policy**: the single source of truth. |
| `scripts/lib/newsroom.mjs` | Helpers shared with n8n (URLs, branch names, review/verification parsers, article builder, quality checks). |
| `scripts/lib/svg-safety.mjs` | Allowlist validator for AI editorial SVGs. |
| `n8n/` | Canonical workflow export (sanitized), prompts, generated Code-node snippets. |
| `.github/workflows/` | Checks, auto-open PR, publication gate, cleanup. |
| `docs/` | Architecture, pipeline, recovery, source matrix, baseline. (Distribution/Shorts engines live on branch `engines/distribution-shorts`, outside production.) |
| `WORKLOG.md` | Chronological engineering log. Append to it. |

## Commands

```bash
npm ci && npm test            # site tests (validator, SVG safety, policy, gate, n8n snippets, GitHub scripts)
npm run validate              # content + n8n export secret scan + snippet freshness
npm run build                 # production build (57 pages as of 2026-09-26); must leave `git status` clean
npm audit --audit-level=high
npm run n8n:snippets          # regenerate n8n/snippets after changing scripts/lib/*.mjs
```

## How publication works (short version)

n8n drafts, reviews and verifies a story, then commits it to `incoming/<slug>-<hash8>`. Build, Security, CodeQL and the duplicate guard run on that push. GitHub opens a PR for the audit trail. The publication gate (`auto-publish.yml`) squash-merges the PR only if **all** of these hold:

- **Low risk:** `editorialReview: "passed"`.
- **Sensitive:** also `verification: "cleared"` and `reviewedBy: "Nuvellum Verification Pipeline"`.
- The PR adds exactly one new article, plus its own AI art.
- The quality rules pass.
- Every required check is green on the exact head SHA.
- The kill switch `NUVELLUM_AUTOPUBLISH` is `on`.

Vercel then deploys `main`. Details: `docs/EDITORIAL_PIPELINE.md`.

## Before you finish any change

- [ ] `npm test`, `npm run build`, `git status` clean, `npm audit` clean.
- [ ] If workflows changed: `actionlint`, and no `${{ inputs.* }}` or `github.event.*` interpolated directly into `run:`.
- [ ] If `scripts/lib/*.mjs` changed: `npm run n8n:snippets` and commit the result.
- [ ] If anything the site renders changed: compare `dist/` with the previous build and take screenshots (desktop 1440×900, mobile 390×844). They must be pixel-identical unless visual approval exists.
- [ ] Append to `WORKLOG.md`.

## Known limitations (2026-09-26)

- 18 of the 27 published articles are **seed placeholders**: two bodies duplicated 12 and 6 times. They are live and indexed. They need real content or `noindex`; the owner decides.
- The live n8n workflow (v6.5, id `8hXx6NuZuJU9dRR1`) is exported, sanitized, in `n8n/workflows/nuvellum-newsroom.json`. It emits `editorialReview`, `verification`, `reviewedBy`, `publishedAt`, canonical `sourceUrls` and deterministic `incoming/<slug>-<hash8>` branches, and its output passes `scripts/validate-content.mjs` and `newStoryQualityProblems`. The workflow stays inactive and `NUVELLUM_AUTOPUBLISH` stays off until three real end-to-end runs pass.
