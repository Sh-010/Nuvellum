# Nuvellum editorial pipeline

## Goal

Source material becomes a reviewable GitHub pull request, not an invisible direct publish. Production remains Git-backed and Vercel deploys only from accepted changes to `main`.

## Automated intake

Recommended n8n flow:

1. Schedule or manual trigger.
2. Read approved RSS feeds and canonicalize links: https, no fragment, tracking parameters removed.
3. Reject non-article formats: live blogs, video/audio, galleries, podcasts, newsletters and quizzes.
4. Remove duplicate source URLs and pick up to three candidates, spread across different outlets and desks.
5. Fetch the full source page.
6. Extract the story body. Prefer structured `articleBody` (JSON-LD), then `<article>`, then `<main>`, then RSS text. Text that doesn't mention the source headline is rejected, so unrelated stories are never merged.
7. Reject items with insufficient source text.
8. Check for duplicates by exact source against published stories (`/search-index.json`) and open editorial PRs, then with a model-based same-story check.
9. Draft an original Nuvellum article from the source only, with a sentence-case headline. Short sources give short articles; there is no padding.
10. Run editorial review, then sensitive verification when required (see below).
11. Generate a story-specific SVG illustration and sanitize it. If the SVG is unusable, fall back to the section image.
12. Run the final metadata contract gate.
13. Read the current GitHub `main` SHA.
14. Create the deterministic branch `incoming/<slug up to 60 chars>-<8-hex source hash>`. One source always maps to one branch. If the branch already exists, that story is skipped and the run continues.
15. Commit `public/generated/ai/<slug>.svg` (when generated) and `src/content/articles/<slug>.md`.
16. An editorial pull request against `main` is opened for the branch.
17. GitHub Actions validates content and SVG safety, checks for duplicate sources, audits dependencies, runs CodeQL and builds the full site before merge.

Every failure affects only its own story and skips to the next candidate. It never aborts the whole run.

## Publication behavior (automated verification policy)

Every automated story passes through two model-based gates before anything is committed. The canonical workflow is n8n "Nuvellum v6.5" (`8hXx6NuZuJU9dRR1`).

1. **Editorial review** compares the draft with the source text. It checks for unsupported facts, invented quotes or numbers, distorting omissions, copying, persuasion and misleading headlines. A clean pass writes `editorialReview: "passed"`. Anything else, including an unparseable review, skips the story.
2. **Sensitive verification** runs only for sensitive stories, as a separate, stricter second pass. It checks attribution of contested claims, inferred motive or guilt, altered quotes, partisan tone, laundered opinion, omitted uncertainty and overstated headlines. Only an explicit clean pass clears the story. The workflow then writes:
   - `verification: "cleared"`
   - `reviewedBy: "Nuvellum Verification Pipeline"`
   - `status: "published"`

   A failed, uncertain or unparseable verification is never committed.

A final contract gate in the workflow refuses to commit any story whose metadata does not match these outcomes.

Low-risk stories that pass editorial review are committed with `status: "published"`.

The repository validator enforces the same contract. A published automated story carrying `publishedAt` must have:
- `editorialReview: "passed"`
- if it is sensitive: `verification: "cleared"` and `reviewedBy: "Nuvellum Verification Pipeline"`

A story with `verification: "failed"` can never be published.

**Merging the pull request is the publication step.** Stories reach production only when their PR merges into `main` and Vercel deploys. Merging requires these checks to pass: content validation, build, duplicate-source guard, security checks and CodeQL. Automatic merging of eligible newsroom PRs (`NUVELLUM_AUTOPUBLISH`) stays off until three consecutive end-to-end runs have been verified. Until then, a maintainer merges once the checks pass.

Sensitive includes:
- politics and elections
- allegations about identifiable people
- crime accusations
- armed conflict and deaths or serious harm
- sensitive personal data
- security or privacy breaches
- lawsuits and material legal or reputational risk

Manually written stories keep the manual rule: a sensitive manual story needs a named `reviewedBy` editor.

## Metadata contract for automated stories

| Field | Value |
|---|---|
| `origin` | `"automation"` |
| `publishedAt` | ISO-8601 UTC timestamp. It must fall on `date` and orders same-day stories on the homepage, `/latest` and section pages. |
| `sourceUrls` | One canonical https URL, with tracking parameters removed. |
| `sourceNote` | Names the real outlet, never a placeholder. |
| `risk` | `"low"` or `"sensitive"` |
| `editorialReview` | `"passed"` |
| `verification` | `"cleared"` (sensitive stories only) |
| `reviewedBy` | `"Nuvellum Verification Pipeline"` (sensitive stories only) |
| `image` | `/generated/ai/<slug>.svg`, the story-specific illustration committed in the same PR, or the section fallback under `/images/`. |

AI illustrations under `public/generated/ai/` must be named `<slug>.svg` for an existing article. The validator re-checks every one of them strictly:
- single `<svg>` root with the SVG namespace, at most 150 KB
- element allowlist, with no text elements
- no scripts, event handlers, links or `href`
- no `data:` URIs, external `url()` references, `@import`, DOCTYPE, entities or CDATA

## Credentials

Use two separate n8n credentials:

### Google Gemini

Select the existing Gemini API credential on the drafting, duplicate-check and editorial-review nodes.

### GitHub fine-grained token

Create a token limited to the **Nuvellum** repository only. The workflow needs repository Contents write permission and Pull Requests write permission. Store it in n8n's credential store as an HTTP Header Auth credential:

- Header: `Authorization`
- Value: `Bearer <token>`

Do not paste the token into a Code node, workflow JSON, article file, or GitHub repository.

## Why pull requests instead of direct publishing

The PR is the control point. It carries the generated article, source URL, risk classification, automated review and verification results, build result and security checks before a story can affect production. This holds even when eligible PRs are merged automatically.

This also means a bad AI draft, malformed Markdown or broken page cannot silently replace the live site.

## Existing publication contract

Machine-readable payload contract: `docs/article-payload.schema.json`

Human-editable starting point: `docs/article-template.md`

Repository validation: `scripts/validate-content.mjs`
