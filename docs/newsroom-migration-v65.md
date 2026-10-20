# Nuvellum v6.5 to GitHub Actions migration

**State: staged and manual-only.** This branch does not change the production pipeline or enable a new schedule.

## Architecture

- scripts/newsroom-engine.py contains the dependency-free newsroom engine: 27 RSS feeds, up to five candidates, one approved story per run, URL normalization and deduplication, Gemini duplicate/drafting/review stages, and repository-compatible frontmatter.
- tests/test_newsroom_engine.py tests feed parsing, duplicates, URL rejection, article extraction and editorial metadata.
- .github/workflows/newsroom-migration.yml runs migration tests when migration-branch code changes and offers three manual modes: feed_check (no AI), dry_run (AI; no writes), submit_for_review (one review-only incoming branch).
- Nuvellum's existing incoming-branch automation, GitHub PR gate, content validation, visual acquisition and Vercel deployment remain unchanged. The migrated engine leaves image metadata unset; the repository's licensed-photo acquisition and text-led fallback handle presentation.

## Credentials and safety

Set GitHub Actions repository secrets:
1. NUVELLUM_GEMINI_API_KEY: a Gemini Generative Language API key.
2. Reuse the existing NUVELLUM_DEPLOY_KEY secret already used by visual acquisition. If this deploy key has write access, it can push the incoming article branch over SSH, triggering the downstream checks. If no SSH deploy key is configured, instead set NUVELLUM_EDITORIAL_TOKEN to a fine-grained GitHub PAT or App token scoped to Sh-010/Nuvellum with Contents read/write. Ordinary GITHUB_TOKEN writes may not trigger downstream workflows. Never commit credentials.

Review-branch write mode additionally checks ALLOW_EDITORIAL_WRITES=on, set only by the explicit submit_for_review workflow input. The resulting article has status=review by default; it cannot be automatically merged even when the repository's existing auto-publish setting is enabled. A separate, deliberately configured NUVELLUM_ALLOW_AUTOPUBLISH=on is needed for future unattended publishing. It stops on missing published index or PR data, blocks exact and semantic duplicates, and invokes the existing article validator before writing. Sensitive stories are recorded for human review, not merged automatically.

## Activation checklist

1. Confirm the Python unit tests and existing repository checks pass on this PR.
2. Use feed_check on the default branch after merging; replace feeds that have become unavailable.
3. Use dry_run after adding the Gemini key; verify the model name works and review rejection summaries.
4. When the full chain is ready, use submit_for_review manually once, confirm the resulting incoming branch/PR, build checks, duplicate guard, and visual acquisition. This review-only test does not merge or deploy an article.
5. Independently examine published facts, sections, attribution, and image provenance. Sensitive stories must stay human-approved.
6. Only after a successful monitored review and an expressly approved end-to-end merge/deployment test should an hourly cron trigger be added. Setting NUVELLUM_ALLOW_AUTOPUBLISH=on must be explicit and the hourly quota must be checked.

## Known differences from n8n

- Full source extraction uses HTMLParser and JSON-LD instead of n8n CSS selectors. Live feed testing is mandatory.
- The Gemini model is configurable and defaults to gemini-3.5-flash-lite. Verify model availability and free-tier quotas with the account.
- This first migration does not call the old Gemini SVG illustrator. Existing photo acquisition and intentional text-led stories avoid inaccurate or unsafe decorative visuals.
- The n8n workflow export is a rollback reference; equivalence is not asserted until real end-to-end tests pass.

Do not enable an automatic schedule just because repository tests pass.
## Verified initial test results (20 October 2026)

GitHub Actions migration unit tests passed, and a live feed check successfully processed all 27 source URLs: 509 recent feed items, zero reported feed errors, five chosen candidates. No Gemini credential-backed dry run or actual new article push has occurred.
