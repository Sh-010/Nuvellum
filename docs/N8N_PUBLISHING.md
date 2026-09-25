# Nuvellum publishing workflow

Nuvellum is static-first. n8n does not need an admin password, CMS login, or public publishing API.

The preferred production flow is now **source → n8n → GitHub review branch → pull request → checks → human merge → Vercel**.

See `docs/EDITORIAL_PIPELINE.md` for the full architecture.

## Core rules

1. Fetch candidate stories from approved sources.
2. Extract verifiable source text and keep the source URL.
3. Draft original copy; do not republish source text.
4. Classify as News / Analysis / Opinion / Review / Explainer / Essay / Ideas.
5. Run duplicate, attribution, factual, legal-risk and quality checks.
6. Build Markdown matching `docs/article-payload.schema.json`.
7. Create a unique `incoming/<slug>-<timestamp>` GitHub branch.
8. Commit only `src/content/articles/<slug>.md`.
9. Open a pull request against `main`.
10. Let GitHub Actions run content validation, dependency audit, CodeQL and the production build.
11. Merge only after review.

## Sensitive material

Politics/elections, allegations about identifiable people, crime accusations, armed conflict, sensitive personal data, and serious legal/reputational risk must use:

- `origin: "automation"`
- `risk: "sensitive"`
- `status: "review"`

Before publication, a human editor must add `reviewedBy` and change the status to `published`.

## Low-risk material

Low-risk automated content may be prepared with `status: "published"`, but it still remains offline until the GitHub pull request is merged.

This preserves a human merge gate without requiring WordPress.

## GitHub credential

Use a fine-grained token limited to the Nuvellum repository. Grant only the permissions needed for repository contents and pull requests. Store it in n8n's credential store, never in the workflow JSON or repository.

## Images

At launch, use the existing section artwork or approved files under `public/uploads/YYYY/MM/`. Later, object storage can be added without changing article URLs.

## Failure behavior

The workflow should fail closed:

- duplicate check cannot be parsed → skip;
- source text is insufficient → skip;
- article JSON cannot be parsed → skip;
- editorial review cannot be parsed → skip;
- repository validation fails → PR cannot be considered ready;
- build fails → do not merge.

The approved v5.1 homepage baseline remains checksum-protected and cannot be replaced by article automation.
