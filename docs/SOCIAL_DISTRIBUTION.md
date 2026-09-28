# Social distribution

Nuvellum's first social-distribution layer is deliberately **dry-run only**. It prepares platform-specific copy after an article reaches `main`, but it does not post to any social account.

## Flow

```
published article
  -> load safe article payload
  -> generate platform-specific deterministic copy
  -> add per-platform UTM tracking
  -> validate length/link/sensational-language rules
  -> describe the required media state
  -> upload JSON drafts as a GitHub Actions artifact
```

Current draft targets:

- X
- Threads
- Facebook
- LinkedIn
- Instagram

The same text is **not** copied everywhere. Each platform gets a separate format and tracked link where appropriate.

## Visual rule

Social distribution follows the production visual policy:

```
real relevant photo -> approved story-specific illustration -> designed Nuvellum social card
```

A text-led article never receives fake story art. Its distribution report uses `text-card-needed`; a later social-card renderer will turn that into a deliberate Nuvellum card.

## Tracking

Links use:

- `utm_source=<platform>`
- `utm_medium=social`
- `utm_campaign=article`
- `utm_content=<article-slug>`

This gives GA4 a clean platform-attribution contract once reader analytics are enabled.

## Running locally

```bash
node engines/distribution/cli.mjs --slug <published-slug>
```

Outputs are written to `engines/out/distribution/<slug>.json`.

## Automation

`.github/workflows/social-distribution.yml`:

- tests the engine on pull requests that change it;
- after a new article reaches `main`, prepares drafts and uploads them as a 30-day artifact;
- supports manual dispatch for a specific slug.

There are intentionally **no social API tokens or live adapters yet**. Live posting should only be added after Nuvellum's accounts exist and at least one batch of generated drafts has been reviewed.
