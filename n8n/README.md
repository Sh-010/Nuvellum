# Nuvellum n8n workflows

This folder is the version-controlled home of the **canonical production newsroom workflow**. There is one production workflow. Bugs are fixed by patching it here and re-importing, not by creating a new workflow version in n8n.

```
n8n/
  README.md                         this file
  workflows/
    nuvellum-newsroom.json          canonical production workflow (sanitized export of live v6.5)
  prompts/                          versioned prompts for draft, review, verification, SVG
  snippets/                         GENERATED Code-node JavaScript (tested in CI)
```

## Live production workflow (v6.5)

The canonical workflow is **"Nuvellum v6.5 — Fixed Source Resolution"**, n8n id `8hXx6NuZuJU9dRR1`. `workflows/nuvellum-newsroom.json` is its sanitized export at n8n version `b2693640-37ba-42f8-ac82-ec4b3452869c`. Fix it in place; do not create v6.6+ copies.

**The live Code nodes are the code in that export, not the generated snippets below.** v6.5 was stabilized directly in n8n and verified against real execution data. Its output (low-risk, sensitive-cleared and sensitive-failed cases) passes `scripts/validate-content.mjs` and `newStoryQualityProblems`. The snippets are an alternative, CI-tested implementation of the same contract. Before replacing any live node with a snippet, test it against a real execution, and never downgrade the live behaviour listed here.

| Live node | Behaviour |
| --- | --- |
| Queue Latest Candidates | Canonical https URLs without tracking params (utm_*, fbclid, gclid, __source, maca, …). Rejects live blogs (`/live/`, `/live-<id>`), video/av, audio, galleries, podcasts, newsletters and quizzes. Skips failed feeds. Takes up to 3 candidates across different outlets and desks. |
| Prepare Source | Real outlet names. Story text from JSON-LD `articleBody` first, then `<article>`/`<main>`/RSS, with an on-topic guard so unrelated stories are never merged. |
| Prepare Duplicate Context / Check Open PR Duplicates | Exact-source dedupe against the live search index and open PRs, by source URL or branch hash. |
| Parse Draft & Build Markdown | Sentence-case headlines. `publishedAt`. Real outlet in `sourceNote`. No padding. Fails closed per story. |
| Parse Editorial Review | `editorialReview: "passed"` only on a clean pass. Low-risk stories become `published`. |
| Parse Sensitive Verification | Only a clean pass writes `verification: "cleared"`, `reviewedBy: "Nuvellum Verification Pipeline"` and `status: "published"`. Failed or uncertain stories are never committed. |
| Sanitize Editorial SVG | Strips unsafe content, then re-checks against an element allowlist and blocked patterns. Anything left unsafe falls back to the section image. The repository validator re-checks the committed file with `svg-safety.mjs`. |
| Build GitHub Payload | Final contract gate before any commit. Branch `incoming/<slug ≤60>-<8-hex FNV-1a of the normalized source URL>`. |
| Create Review Branch | An existing branch skips the story; the run continues. |

The workflow is **inactive**. `NUVELLUM_AUTOPUBLISH` stays off until three real end-to-end runs have passed.

## Code-node snippets

`n8n/snippets/*.js` are generated from `scripts/lib/newsroom.mjs` and `scripts/lib/svg-safety.mjs` by `npm run n8n:snippets`. CI fails if they are stale. `tests/n8n-snippets.test.mjs` executes each one in an n8n-like sandbox with no `require`.

| Snippet | Place it | What it guarantees |
| --- | --- | --- |
| `normalize-candidates.js` | right after the RSS merge | canonical URLs without tracking parameters, no live blogs or video pages, no items without a URL, no duplicates within a run, deterministic `sourceHash` |
| `parse-review.js` | after the editorial-review model | `editorialReview` is `passed` only with an explicit pass on every criterion; anything else is `failed` or `uncertain` |
| `parse-verification.js` | after the sensitive verifier | `verification` is `cleared` only with an explicit pass on all ten criteria |
| `validate-svg.js` | after SVG generation | unsafe or broken art is dropped, and the section image is used |
| `build-article.js` | before the GitHub commit | the Markdown file, path, art path and deterministic branch; `status` is derived from review and verification, so it can't be set by hand |

To use one, paste the file into a Code node set to "Run Once for All Items". After updating the repository, re-paste. Never edit a snippet inside n8n.

The prompts in `n8n/prompts/` define the JSON the parsers expect. Keep prompt and parser changes in the same PR.

`n8n/raw/` and `*.raw.json` are gitignored. Raw exports never go into Git.

## Updating the canonical workflow

1. In n8n, open the production workflow → **⋯ → Download**. Save it as `n8n/raw/nuvellum-newsroom.raw.json`.
2. Sanitize it:
   ```bash
   npm run n8n:sanitize -- n8n/raw/nuvellum-newsroom.raw.json n8n/workflows/nuvellum-newsroom.json
   ```
   The sanitizer:
   - keeps credential *names* and drops credential ids;
   - removes `pinData` (cached source text and API responses), `staticData` and the instance id;
   - redacts anything that looks like a secret.

   If it redacts a real key, **rotate that key**, because it was stored in plain text inside n8n.
3. Review `git diff n8n/workflows/`, then commit on a branch and open a PR.
4. CI runs `scripts/check-n8n-exports.mjs` as part of `npm run validate`. It fails the build if any committed export contains a secret-like string, a credential id or pinned data.

The sanitizer cannot recognise a secret typed as a literal inside a Code node's JavaScript. Keep every secret in n8n's credential store.

## Contract the workflow must follow

The repository enforces the rules below. A story that breaks them is not published.

### Branch and commits

- Branch name: `incoming/<slug>-<8 hex deterministic source hash>`. Live v6.5 uses FNV-1a of the normalized source URL; `scripts/lib/newsroom.mjs` uses sha256. The gate checks the format and slug, so both are accepted. The same source always maps to the same branch.
- Commits: `src/content/articles/<slug>.md` and, optionally, `public/generated/ai/<slug>.svg`. Nothing else goes on the branch.
- The article must be a **new** file. Automation never edits a published article.
- Push with n8n's own GitHub credential (fine-grained token, Nuvellum repo only, Contents read/write). Those pushes start Build, Security, CodeQL and the duplicate guard. Work that GitHub starts with `GITHUB_TOKEN` does not trigger other workflows, so the pushes must not come from GitHub's token.
- n8n does **not** need to open or merge the PR. GitHub opens it (`auto-open-editorial-pr.yml`) and the publication gate merges it (`auto-publish.yml`).

### Frontmatter

| Field | Value written by n8n |
| --- | --- |
| `origin` | `"automation"` |
| `risk` | `"low"` or `"sensitive"` (see `docs/SOURCE_MATRIX.md`) |
| `editorialReview` | `"passed"` only if the editorial/risk review node explicitly passed. Otherwise `"failed"` or `"uncertain"`. |
| `verification` | Sensitive stories only: `"cleared"` only if the dedicated verification pass explicitly cleared the story. Otherwise `"failed"` or `"uncertain"`. |
| `reviewedBy` | Sensitive and cleared: `"Nuvellum Verification Pipeline"`. Otherwise `""`. |
| `status` | `"published"` only when the story is cleared (see below). Otherwise `"review"`. |
| `image` | `/generated/ai/<slug>.svg` when AI art was committed; otherwise the section image, e.g. `/images/world.svg`. |

A story is cleared when:

- **Low risk:** `editorialReview: "passed"`.
- **Sensitive:** `editorialReview: "passed"` **and** `verification: "cleared"`.

Any parse failure, timeout, empty model response or ambiguous verdict is treated as `"uncertain"`. The pipeline fails closed.

Better still, the workflow should skip failed or uncertain stories rather than commit them. If one is committed, the validator and the gate still keep it off the site.

### AI illustrations

The SVG must pass `scripts/lib/svg-safety.mjs`. That means inert drawing elements only: no `<script>`, `<foreignObject>`, `<image>`, `<a>`, event handlers, external or `data:` URLs, or non-local `href`s. Only `url(#id)` references are allowed.

If Gemini returns an SVG that still fails this check after sanitizing, commit no art and fall back to the section image. Live v6.5 sanitizes, then re-validates strictly, and the repository validator always re-checks the committed file.

### Headline and source hygiene

- Headlines use sentence case, matching the published archive.
- `sourceNote` must name the real outlet, e.g. "Prepared from BBC reporting…", never the placeholder word "Source".
- Store canonical source URLs without tracking parameters where possible.

## Connecting Claude (or another agent) to the live n8n instance

An n8n MCP connection is in use as of 2026-09-26. Here is what an agent session needs, all supplied by you and never committed:

1. In n8n, go to **Settings → n8n API → Create API key**. Give it a clear label, e.g. "Claude maintenance".
2. Note your instance's base URL, e.g. `https://<name>.app.n8n.cloud`.
3. Connect using one of these:
   - **An n8n MCP server** configured in your Claude app or Claude Code settings with those two values (for example the community `n8n-mcp` server, with `N8N_API_URL` and `N8N_API_KEY`).
   - **An environment** where the agent can call the n8n public API (`GET /api/v1/workflows`, `PUT /api/v1/workflows/{id}`) with the `X-N8N-API-KEY` header.
4. First action in any maintenance session: export the production workflow, sanitize it, and commit it here **before** changing anything. This is the backup and the diff baseline.
5. Stabilize the existing workflow **in place**. Don't clone it into new versions (v6.5, v6.6, …).

## Credentials

| n8n credential | Used by | Scope |
| --- | --- | --- |
| Google Gemini | drafting, review, verification, SVG | API key in n8n credential store |
| GitHub (HTTP Header Auth) | branch + file commits | fine-grained token, Nuvellum repo only, Contents read/write |
| Anthropic (planned) | multi-model review/verification | API key in n8n credential store |

Never paste a key into a Code node, an HTTP node's literal header, workflow JSON committed here, or any file in this repository.
