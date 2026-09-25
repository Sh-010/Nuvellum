# Nuvellum editorial pipeline

## Goal

Source material becomes a reviewable GitHub pull request, not an invisible direct publish. Production remains Git-backed and Vercel deploys only from accepted changes to `main`.

## Automated intake

Recommended n8n flow:

1. Schedule or manual trigger.
2. Read approved RSS feeds.
3. Remove duplicate source URLs.
4. Fetch the full source page.
5. Extract the strongest article body candidate.
6. Reject items with insufficient source text.
7. Read `/search-index.json` and run a duplicate-story check.
8. Draft an original Nuvellum article from the source only.
9. Run a second editorial/factual review.
10. Build the Markdown file with Nuvellum frontmatter.
11. Read the current GitHub `main` SHA.
12. Create a unique `incoming/<slug>-<timestamp>` branch.
13. Commit only `src/content/articles/<slug>.md`.
14. Open an editorial pull request against `main`.
15. GitHub Actions validates content, dependencies and the full site build before merge.

## Publication behavior

- Low-risk stories may be generated with `status: "published"`, but they still do **not** reach production until a human merges the PR.
- Sensitive stories are generated with `status: "review"`.
- A sensitive story must be source-checked by a human editor, have `reviewedBy` filled, and have its status changed to `published` before it can appear on Nuvellum.
- The repository validator blocks sensitive automated stories marked published without `reviewedBy`.

Sensitive includes politics/elections, allegations about identifiable people, crime accusations, armed conflict, sensitive personal data, and material legal/reputational risk.

## Credentials

Use two separate n8n credentials:

### Google Gemini

Select the existing Gemini API credential on the drafting, duplicate-check and editorial-review nodes.

### GitHub fine-grained token

Create a token limited to the **Nuvellum** repository only. The workflow needs repository Contents write permission and Pull Requests write permission. Store it in n8n's credential store as an HTTP Header Auth credential:

- Header: `Authorization`
- Value: `Bearer <token>`

Do not paste the token into a Code node, workflow JSON, article file, or GitHub repository.

## Why pull requests instead of direct auto-publish

The PR is the control point. It gives you the generated article, source URL, risk classification, automated review note, build result and security checks before a story can affect production.

This also means a bad AI draft, malformed Markdown or broken page cannot silently replace the live site.

## Existing publication contract

Machine-readable payload contract: `docs/article-payload.schema.json`

Human-editable starting point: `docs/article-template.md`

Repository validation: `scripts/validate-content.mjs`
