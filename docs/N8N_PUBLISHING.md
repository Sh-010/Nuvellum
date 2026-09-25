# Nuvellum publishing workflow

Nuvellum is static-first. n8n does not need an admin password, a CMS login, or a public publishing API. It prepares a Markdown article and commits it to GitHub. Vercel then rebuilds the site.

## Recommended production flow

1. Fetch candidate stories from approved sources.
2. Extract verifiable facts and source URLs.
3. Draft original copy; do not republish source text.
4. Classify as News / Analysis / Opinion / Review / Explainer / Essay / Ideas.
5. Run duplicate, attribution, legal-risk and quality checks.
6. Create Markdown using `docs/article-template.md`.
7. Use `status: review` by default for politics, accusations, crime allegations, conflict coverage, identifiable-person claims, paid content, unclear sourcing, or other sensitive material.
8. Use `status: published` only after the applicable review gate passes.
9. Commit to `src/content/articles/<slug>.md` through GitHub.
10. GitHub Actions validates the content and builds it.
11. Vercel deploys the accepted `main` commit.

## GitHub step in n8n

Use GitHub's Create or Update File action.

- Path: `src/content/articles/{{$json.slug}}.md`
- Commit message: `publish: {{$json.title}}`
- Branch: use a review branch for sensitive content; use `main` only for content that has passed the editorial gate.
- Never put API keys, source credentials, access tokens, cookies, or private source material in the repository.

## Required article fields

The build rejects malformed content before deployment. Every story needs:

`title`, `dek`, `section`, `type`, `author`, `date`, `readingTime`, `image`, `imageAlt`, `status`, and `tags`.

File names must be lowercase URL slugs such as `new-industrial-policy.md`.

Article bodies must be Markdown. Raw HTML and dangerous script/event-handler patterns are blocked by the validator.

## Images

At launch, place approved article images in `public/uploads/YYYY/MM/` and reference them as `/uploads/YYYY/MM/file-name.webp` (or another web image format). Do not put credentials or private images in `public/`.

## Editorial safety gate

Automation should prepare sensitive stories, not autonomously publish them. Human review is required for material involving political persuasion, allegations about identifiable people, criminal claims, high-impact conflict reporting, sensitive personal data, paid praise/attack content, or unclear sourcing.

## Deployment safety

The production homepage design is restored from the checksum-pinned v5.1 archive during every build. Content automation cannot replace the homepage route. If content validation, the baseline checksum, or the Astro build fails, deployment stops instead of publishing a broken version.
