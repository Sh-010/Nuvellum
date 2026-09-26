# Nuvellum editorial pipeline

## Goal

Nuvellum is designed to operate without a permanent human copy desk. Source material is processed through multiple automated editorial gates, proposed on an incoming GitHub branch, validated by repository checks, and published only when those gates agree that the story is ready.

Git remains the audit trail and Vercel deploys only from accepted changes to `main`.

## Automated intake

The n8n newsroom flow:

1. Runs on a schedule or manually.
2. Reads Nuvellum's approved, diversified RSS feeds.
3. Normalizes source URLs and removes duplicate candidates.
4. Fetches the source article and extracts the strongest usable text.
5. Rejects items with insufficient source material.
6. Checks both published Nuvellum stories and open editorial branches for duplicates.
7. Drafts an original Nuvellum article from the source material.
8. Runs a separate editorial/factual review.
9. For sensitive stories, runs an additional strict verification pass focused on attribution, unsupported claims, neutrality, legal/reputational risk, and political persuasion.
10. Rejects sensitive stories that do not pass that second gate. Failed stories are skipped rather than left waiting for a nonexistent human reviewer.
11. Generates a story-specific editorial SVG where possible, with the existing Nuvellum illustration system as fallback.
12. Creates an `incoming/<slug>-<source-hash>` branch and commits the article and any generated illustration.
13. GitHub opens the editorial pull request automatically.
14. Build, Security, CodeQL and the editorial duplicate guard run against the branch.
15. GitHub automatically merges a story only when the article is marked `status: "published"` and every required repository check is green.

## Publication behavior

### Low-risk stories

Low-risk reporting is marked `status: "published"` after the normal editorial review passes. Once the repository checks are green, GitHub automatically merges the PR and Vercel publishes it.

### Sensitive stories

Sensitive reporting includes politics and elections, armed conflict, crime accusations, deaths or serious harm, security/privacy incidents, lawsuits, and other serious legal or reputational claims.

A sensitive article starts as `status: "review"`. It then goes through the separate Nuvellum Sensitive Verification gate.

That verifier must confirm that:
- the article is supported by the supplied source material;
- disputed claims are explicitly attributed;
- motives, guilt, intent and causation are not inferred beyond the source;
- quotes are faithful;
- material uncertainty and counter-positions in the source are preserved;
- political coverage is descriptive rather than persuasive, predictive or partisan;
- the headline and dek do not overstate the evidence.

If the second verifier passes the story, the workflow changes it to `status: "published"` and records:

`reviewedBy: "Nuvellum Verification Pipeline"`

If it fails, the story is not published and the workflow moves on to another candidate.

This is intentionally fail-closed: uncertainty stops publication rather than silently weakening the standard.

## Pull requests

Pull requests remain in the architecture even though ordinary publication is automatic. They provide a durable audit trail of the generated article, source URL, image asset, risk classification and every repository check.

A PR is therefore a machine-auditable staging step, not a requirement that somebody manually click Merge.

## Credentials

### Google Gemini

The existing Gemini credential is used for duplicate evaluation, drafting, editorial review, sensitive-story verification and editorial SVG generation.

### GitHub

n8n uses the existing repository-scoped GitHub credential for branch and file writes. GitHub Actions opens and merges eligible pull requests using the repository's built-in token.

Do not place tokens inside Code nodes, article files or the repository.

## Existing publication contract

Machine-readable payload contract: `docs/article-payload.schema.json`

Human-editable starting point: `docs/article-template.md`

Repository validation: `scripts/validate-content.mjs`
