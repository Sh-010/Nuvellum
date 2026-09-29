# Social distribution

Nuvellum's first social-distribution layer is deliberately **dry-run only**. It prepares platform-specific copy after an article reaches `main`, but it does not post to any social account.

## Flow

```
published article
  -> load safe article payload
  -> generate platform-specific deterministic copy
  -> add per-platform UTM tracking
  -> validate length/link/sensational-language rules
  -> render branded 1:1 and 4:5 social cards
  -> attach the correct card to each feed draft
  -> upload copy + card artifacts through GitHub Actions
```

Nuvellum prepares two parallel distribution tracks:

- **Feed/static:** X, Threads, Facebook, LinkedIn and Instagram.
- **Short video:** X video, Facebook Reels, Instagram Reels, TikTok and YouTube Shorts.

The same text is **not** copied everywhere. Each platform and track gets its own format and tracked link where appropriate.

## Visual rule

Social distribution follows the production visual policy:

```
real relevant photo -> approved story-specific illustration -> designed Nuvellum social card
```

The social-card renderer is implemented. Every published story gets a deterministic 1080×1080 square card and 1080×1350 portrait card in Nuvellum's ivory/charcoal/burgundy editorial system. When a real photo or approved illustration exists it is embedded into the card; text-led stories use typography, rules and the N✦ mark instead of fake imagery. Instagram uses the portrait card while the other feed targets use the square card. The short-video track points to the Shorts/Reels engine described in `docs/SHORTS_ENGINE.md`; video rendering remains dry-run and is not auto-posted.

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

Outputs are written to `engines/out/distribution/<slug>.json` and `engines/out/social-cards/<slug>/`.

## Automation

`.github/workflows/social-distribution.yml`:

- tests the engine on pull requests that change it;
- after a new article reaches `main`, prepares drafts and uploads them as a 30-day artifact;
- supports manual dispatch for a specific slug.

There are intentionally **no social API tokens or live adapters yet**. Live posting should only be added after Nuvellum's accounts exist and at least one batch of generated drafts has been reviewed. Per-platform account, app, credential and API-restriction requirements: [`SOCIAL_PLATFORM_SETUP.md`](SOCIAL_PLATFORM_SETUP.md).
