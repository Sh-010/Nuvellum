# Nuvellum engineering worklog

Append new entries at the top. Record what changed, the commits, the tests with their results, blockers, and anything that needs the owner.

---

## 2026-09-26 (evening): pushed, draft PRs opened, CI verified on GitHub

- GitHub write access became available. Pushed `checkpoint/pre-stabilization-2026-09-26` (= `main` @ `c14b931`), `fix/ai-image-validation` and `stabilize/newsroom`. The git proxy refuses tag pushes, so the checkpoint exists as a branch only.
- Draft PRs: #30 (`fix/ai-image-validation`) and #31 (`stabilize/newsroom`). Nothing merged.
- CI on GitHub:
  - #30: Build, Security checks, CodeQL all success; Vercel preview success.
  - #31: Build, Security checks, CodeQL, Engines tests all success, including the MP4 render on the GitHub runner; Vercel preview success.
  - CodeQL reported "No new alerts in code changed by this pull request" on both.
- Only annotations: GitHub platform deprecations (Node 20 actions; CodeQL Action v3, deprecated December 2026). The Dependabot branches for checkout/setup-node are already open. Bump `github/codeql-action` to v4 before December.
- Still owner decisions: merge order (#30 then #31, or #31 alone), closing #27 and #28, and keeping `NUVELLUM_AUTOPUBLISH` unset until n8n emits the new metadata.

## 2026-09-26 — Stabilization sprint (Claude, cloud session)

### Environment and blockers
- This session ran in a cloud container. Pushing to `Sh-010/Nuvellum` returned **HTTP 403** on every attempt: the Claude GitHub App is not installed with write access to the repo, and there's no local Git credential manager in the cloud. **Nothing was pushed, no PRs were opened, and nothing was merged.** All work is committed locally on `stabilize/newsroom` and `fix/ai-image-validation` and delivered as a git bundle and patch.
- Read access worked. All the GitHub findings below come from the live API.
- No n8n connection (MCP or API) was available, so Phase 4 (live workflow stabilization and three consecutive end-to-end runs) could not be done. Instructions are in `n8n/README.md`.

### Checkpoint
- Tag `checkpoint-pre-stabilization-2026-09-26` and branch `checkpoint/pre-stabilization-2026-09-26` point at `main` `c14b931`. Both are included in the bundle.

### Live GitHub evidence (read-only)
- PRs #28 and #29 were opened by `github-actions[bot]`. Their Build, Security, CodeQL and duplicate-guard runs exist but are **`action_required`** (never executed). #26 had real checks only because Sam opened it by hand.
- n8n's pushes appear as actor `Sh-010`, so `push` workflows do run normally.
- `GET git/matching-refs/heads/incoming/` returns 400 with the trailing slash; the duplicate guard was fixed before it ever ran.
- The auto-open workflow failed on #26 with the "already exists" race; it now treats that as success.
- A dry-run gate evaluation of the live PRs holds #26, #28 and #29. Reasons: `docs/RECONCILIATION-2026-09-26.md`.
- Root cause of the EU/Olympics mash-up in #28: the source was a DW **live blog**. Live blogs are now rejected.
- **18 of the 27 published articles are placeholders** sharing two bodies. Left untouched (no rewrites); the owner decides.

### Commits (`stabilize/newsroom`, oldest first)
| Commit | Summary |
| --- | --- |
| `0ce89c9` | Strict `/generated/ai/<slug>.svg` validation and allowlist SVG safety validator (also alone on `fix/ai-image-validation`) |
| `9d8a854` | Build stages into gitignored `.build/public`; `package-lock.json`; `npm ci`; CI fails if a build dirties the tree |
| `c240632` | Article Save button saves the current story and its URL; homepage resolves saved automated stories |
| `0bc4540` | Checks run on `push` to `incoming/**`; duplicate guard rewritten to work without a PR |
| `6e55245` | Publication gate (`auto-publish.yml`, `scripts/lib/editorial.mjs`) with explicit clearance and a kill switch |
| `94859be` | `n8n/` area, export sanitizer, CI secret scan |
| `1e6ea25` | Policy docs and schema |
| `c640f9a` | Fixes from live data (`action_required`, matching-refs, 422 race), quality gate, shared newsroom helpers, `publishedAt` ordering, merged-branch cleanup tool |
| `a8e3e2d` | n8n prompts (editorial review, 10-criterion sensitive verification, drafting, SVG) and CI-tested Code-node snippets; `buildArticle` |
| `42afaa7` | `engines/`: multi-model providers, grounding, Distribution Engine (6 adapters, ledger, retries) |
| `185ef9e` | Shorts Engine (script, verification, TTS chain, deterministic 9:16 renderer); `engines.yml`, `distribution.yml` |
| `74bc782` | AGENTS.md, CLAUDE.md, ARCHITECTURE, ENGINES, RECOVERY, RECONCILIATION, `.env.example`; API-outage tests |

### Tests and results (final run from a clean clone of `stabilize/newsroom`)
- `npm test`: **128/128 pass**. Covers the validator, SVG safety (real and malicious fixtures), the publication policy and quality rules, newsroom helpers, n8n snippets in a sandbox, the n8n sanitizer, and the gate and duplicate guard against a mock GitHub API (including an outage, a branch moving mid-merge and `action_required` runs).
- `npm run build`: **57 pages**. `git status` is clean afterwards.
- `npm audit --audit-level=high`: **0 vulnerabilities** (site and engines).
- `actionlint`: clean. No `${{ inputs.* }}` interpolated into `run:`.
- `engines`: **27/27 pass**, including an end-to-end MP4 render.
- Visual regression against the pre-sprint build: **16/16 screens pixel-identical** (8 pages × desktop 1440×900 and mobile 390×844). The only HTML differences: two non-visual `data-` attributes on article headers, the Save script, and the homepage search/saved bridge.
- Behavioural: the Save button saves the current story, and the homepage saved link routes to it (tested with Playwright).
- Live, read-only: the duplicate guard and the gate were evaluated against real PRs #26, #28 and #29.
- Shorts sample: `scotland-diesel-prices-over-2-pounds`, 41.0 s, 1080×1920 30 fps H.264 High / AAC, 3.6 MB, espeak narration.

### Needs the owner
1. Install or enable the Claude GitHub App with write access to Nuvellum, **or** push the bundle from your machine (commands in the final report).
2. Connect n8n (API key and URL, or an n8n MCP server) so the workflow can be exported, patched in place and run three times end to end.
3. Leave `NUVELLUM_AUTOPUBLISH` unset until n8n emits `editorialReview` and `verification`.
4. Decide what to do about the 18 placeholder articles.
5. Social accounts don't exist yet. Distribution stays in dry run.

## 2026-09-26: reconciliation into one production PR (Claude Code, n8n MCP session)

Two sessions worked in parallel:
- the `stabilize/newsroom` sprint (#30 and #31);
- the local `newsroom-v6.5-stabilization` branch, which had live n8n access over MCP.

This branch (`stabilize/newsroom`, PR #31) is now the single production PR.

**Base:** #31. It is a superset of #30 (commit `0ce89c9`) and of the repo side of `newsroom-v6.5-stabilization`:
- same AI-art rule, with a stricter shared `svg-safety.mjs` and tests;
- same `publishedAt` ordering;
- adds build hygiene, lockfile and `npm ci`;
- adds checks on `incoming/**` pushes;
- adds the publication gate with the `NUVELLUM_AUTOPUBLISH` kill switch, off by default.

**Added from `newsroom-v6.5-stabilization`:**
- `n8n/workflows/nuvellum-newsroom.json`: the sanitized export of the **live** v6.5 workflow (`8hXx6NuZuJU9dRR1`, version `b2693640`), sanitized with `npm run n8n:sanitize`; passes `check-n8n-exports`.
- `n8n/README.md`: documents what is actually deployed in each live node. The live code is canonical; the generated snippets are an alternative implementation and must not overwrite live behaviour untested. Branch hash (FNV-1a in live v6.5) and SVG handling (sanitize, then strict re-check) are corrected.
- The last human-gate wording is removed: `docs/N8N_PUBLISHING.md`, `docs/SOURCE_MATRIX.md`, and one sentence on `src/pages/standards.astro`. Outdated "n8n doesn't emit the contract" notes in `AGENTS.md` are fixed.

**Compatibility, verified locally:** a story produced by the live v6.5 Code nodes, with its sanitized AI SVG, passes this branch's `validate-content.mjs`, `newStoryQualityProblems` and `contentPolicyErrors`:
- low-risk: 0 problems;
- sensitive with `verification: "cleared"`: passes;
- `verification: "failed"`: rejected.

**Removed from production scope:**
- `engines/`, `distribution.yml`, `engines.yml`, `docs/ENGINES.md` and the gate's distribution dispatch. The gate now needs only `actions: read`.
- These are preserved unchanged on branch **`engines/distribution-shorts`** (= `1257948`).

**Superseded, close after this PR merges:**
- #30 (identical commit included here);
- #27 (see `docs/RECONCILIATION-2026-09-26.md`);
- the `newsroom-v6.5-stabilization` branch (repo changes superseded; its live-n8n history is recorded here).

Still open: #26 and #29 must be regenerated, and #28 must be closed, as the reconciliation doc says.

**n8n side (live, in place, no new versions):** Queue now also blocks DW `/live-<id>` pages and strips `maca=` and other trackers. The workflow is still **inactive**.
