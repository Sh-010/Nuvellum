# Nuvellum publishing workflow

Recommended production flow:

1. Fetch candidate stories from approved sources.
2. Extract verifiable facts and source URLs.
3. Draft original copy; do not republish source text.
4. Classify as News / Analysis / Opinion / Review / Explainer.
5. Run duplicate, attribution, legal-risk and quality checks.
6. For low-risk material, create a Markdown file using `docs/article-template.md` with `status: published`.
7. For politics, accusations, crime allegations, praise/attack pieces, conflicts, or other sensitive material, use `status: review` and require a human approval step before changing it to `published`.
8. Commit the file to `src/content/articles/<slug>.md` through GitHub.
9. Cloudflare Pages rebuilds automatically from the GitHub commit.

## GitHub step in n8n

Use GitHub's Create or Update File action. Path: `src/content/articles/{{$json.slug}}.md`. Commit message: `publish: {{$json.title}}`. Never put API keys, source credentials, or secrets in the repository.

## Images

At launch, upload article images into `public/uploads/YYYY/MM/` and reference them from frontmatter. Later this can be moved to Cloudflare R2 or another media store without changing article URLs.

## Editorial safety gate

A story must go to review if it contains accusations about identifiable people, political persuasion, unverified criminal claims, sensitive personal data, paid praise/attack content, or unclear sourcing. Automation should prepare these stories, not publish them automatically.
