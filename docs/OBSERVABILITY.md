# Analytics and observability

Nuvellum separates **reader analytics** from **newsroom health**. Both are optional and fail safely.

## Reader analytics

The production build can inject Google Analytics 4 after Astro finishes. It is disabled unless the Vercel environment variable below is configured:

```
NUVELLUM_GA4_ID=G-XXXXXXXXXX
```

No ID is committed to the repository. With the variable absent, the built HTML receives no analytics script.

The Nuvellum event layer records only publication/product interactions:

- `page_view` (path and page title)
- `scroll_depth` at 25/50/75/90%
- `article_click` (destination path)
- `save_story`
- `newsletter_interaction`
- `outbound_click` (destination domain only)

The instrumentation deliberately avoids sending names, email addresses, search/query strings or article-source URLs in custom event parameters.

Before enabling GA4, the owner must finish the production privacy/consent treatment appropriate to the publication's audience and jurisdictions. The code is intentionally dormant until then.

## Newsroom health

`.github/workflows/observability.yml` runs:

- after each push to `main`
- every six hours
- on manual dispatch

It reports:

- total and automated article count
- output in the past 24 hours / 7 days / 30 days
- latest automated publication
- section and risk distribution
- real-photo / AI-illustration / text-led visual mix
- source-host diversity
- latest main-branch Build, Security, CodeQL and duplicate-guard state
- open `incoming/**` editorial PRs
- deployment/check state when GitHub exposes a Vercel/deployment check

The scheduled job **fails only for concrete operational failures**: a core main-branch workflow failure, an explicit deployment failure, or an unheld incoming PR stuck for more than 24 hours while autopublish is on. Publication inactivity is a warning because there may simply be no acceptable candidates.

Run locally:

```bash
npm run ops:report
```

Without a GitHub token the local report still provides all content/repository metrics; GitHub/deployment checks are omitted.

## What this does not yet measure

n8n execution-level reasons (draft rejection, verification failure, image decision and per-node duration) live inside n8n and are not available to the GitHub-only reporter. The next observability increment should export a small redacted execution event from the live workflow without exposing source text, model prompts or credentials.
