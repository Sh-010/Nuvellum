# Nuvellum editorial pipeline

## Goal

Nuvellum runs without a permanent human copy desk. Source material passes through automated editorial gates, is proposed on an `incoming/**` branch, is validated by repository checks, and is published only when every gate agrees the story is ready. Anything uncertain does not publish.

Git is the audit trail. Vercel deploys only from `main`.

## Flow

1. **n8n newsroom** (canonical workflow: `n8n/workflows/`)
   1. Reads the approved RSS sources (`docs/SOURCE_MATRIX.md`).
   2. Normalizes and deduplicates source URLs.
   3. Extracts the source text and rejects thin sources.
   4. Drafts the article.
   5. Runs the editorial/risk review.
   6. Runs the dedicated verification pass on sensitive stories.
   7. Generates the SVG art.
   8. Commits the result to `incoming/<slug>-<source-hash>`.
   9. The contract it must follow is in `n8n/README.md`.
2. **Checks on the pushed commit.** Build, Security, CodeQL and the Editorial duplicate guard all run on `push` to `incoming/**`.
3. **PR for the audit trail.** `auto-open-editorial-pr.yml` opens the PR.
4. **Publication gate.** `auto-publish.yml` runs `scripts/auto-publish.mjs` from `main`. It squash-merges the PR only if every rule below holds, pinned to the exact commit it evaluated.
5. **Deploy.** Vercel deploys `main`.

### Why checks run on `push`

GitHub does not treat events created with the built-in `GITHUB_TOKEN` like normal events. The auto-opened PR is created with that token. On 2026-09-26 the `pull_request` runs for bot-opened PRs #28 and #29 were created, but GitHub parked every one of them as **`action_required`**: waiting for manual approval and never executed. The only checks on those PRs were therefore `open-pr` and a failing Vercel preview.

n8n pushes with its own credential, which shows as actor `Sh-010`. `push` workflows therefore run normally on `incoming/**`, and their results attach to the exact head commit the PR displays.

The gate ignores the parked `action_required` runs. It judges each required check by its latest run that actually executed on that commit. `pull_request` triggers remain for human-opened PRs.

## Publication policy

| | Low-risk | Sensitive |
| --- | --- | --- |
| `origin` | `automation` | `automation` |
| `status` | `published` | `published` |
| `editorialReview` | `passed` | `passed` |
| `verification` | absent or `cleared` | **`cleared`** |
| `reviewedBy` | any | **`Nuvellum Verification Pipeline`** |
| Build, Security checks, CodeQL, Editorial duplicate guard | all `success` on the head commit | all `success` on the head commit |

The gate also requires all of the following:

- The PR is open, not a draft, targets `main`, and comes from an `incoming/**` branch in this repository.
- It adds exactly one **new** article, plus optionally that article's own `public/generated/ai/<slug>.svg`, and nothing else. Automation cannot edit published articles, workflows or scripts.
- The PR has no `hold`, `do-not-publish` or `needs-human` label.
- The format is not Opinion, Essay, Ideas or Review. Those stay human-led.

Failed or uncertain stories never publish, and this is enforced in two places:

- The content validator rejects any article marked `published` whose `editorialReview` or `verification` is `failed` or `uncertain`. It also rejects `reviewedBy: "Nuvellum Verification Pipeline"` without `verification: "cleared"`.
- The gate requires the positive values above. A missing field counts as not cleared.

Sensitive coverage includes politics and elections, armed conflict, crime accusations, deaths or serious harm, security/privacy incidents, lawsuits, and serious legal or reputational claims.

Articles published before these fields existed are unaffected. The new rules only restrict values that are present, and the gate only acts on new PRs.

## Rollout and kill switch

- The gate merges nothing until the repository variable `NUVELLUM_AUTOPUBLISH` is set to `on` (**Settings → Secrets and variables → Actions → Variables**). Until then it only evaluates and writes its decisions to the run summary.
- To evaluate a PR manually, go to **Actions → Auto-publish verified editorial stories → Run workflow**, enter the PR number, and keep "dry run" ticked.
- To stop one story, add the `hold` label to its PR.
- To stop everything, set `NUVELLUM_AUTOPUBLISH` to `off`.
- Required repository setting: **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"**. Auto-open needs it.
- If `main` has branch protection, it must not require human approvals. Otherwise the gate's merge is refused. Listing the four checks as required status checks is recommended.
- The gate deletes an `incoming/**` branch only after it has merged that branch. The PR keeps the full history.

## Duplicate protection

1. n8n deduplicates candidates against published stories and in-flight branches.
2. `scripts/validate-content.mjs` rejects a source or title already published on `main`.
3. The Editorial duplicate guard compares the branch's sources with every other in-flight editorial branch: open PRs, and `incoming/**` branches without a closed PR. The oldest branch wins and newer duplicates fail. Branches whose story already reached `main` are ignored.

## Credentials

- **Gemini:** drafting, review, verification and SVG generation, stored in the n8n credential store.
- **GitHub (n8n):** a fine-grained token limited to Nuvellum with Contents read/write.
- **GitHub Actions:** the built-in token opens and merges PRs.

Never place tokens in Code nodes, workflow exports, article files or the repository. `scripts/check-n8n-exports.mjs` fails CI if a committed export contains one.

## Publication contract

- Machine-readable payload: `docs/article-payload.schema.json`
- Human-editable template: `docs/article-template.md`
- Validation: `scripts/validate-content.mjs`
- Policy source of truth: `scripts/lib/editorial.mjs`
