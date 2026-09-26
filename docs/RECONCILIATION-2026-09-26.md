# Reconciliation of open PRs and incoming branches (2026-09-26)

Evidence was gathered read-only from the GitHub API and the PR heads on 2026-09-26.

## PR #27 "Newsroom: auto-publish verified stories without a human gate": superseded

Branch `newsroom-auto-publish-low-risk`. Its checks passed, but merging it would create a second auto-publish system alongside the stabilization branch's. **Recommendation: close #27 once `stabilize/newsroom` is merged.**

| #27 did | Kept | Replaced by, and why |
| --- | --- | --- |
| Auto-merge low-risk and verified sensitive stories | ✔ the policy intent | `auto-publish.yml` + `scripts/lib/editorial.mjs`, a single tested decision function run from `main` |
| `reviewedBy: "Nuvellum Verification Pipeline"` as the sensitive marker | ✔ | It now also requires an explicit `verification: "cleared"` and `editorialReview: "passed"`, and the validator rejects the marker without clearance |
| Chose each check's **latest** run by `created_at` | ✘ | That would hold every story forever. The newest runs on bot-opened PRs are `action_required` (never executed) and are ignored now |
| Relied on checks that never run on bot-opened PRs | ✘ | Checks run on `push` to `incoming/**` |
| Loosened the image rule to allow any `/generated/` path | ✘ | Only `/generated/ai/<own-slug>.svg` is allowed, the file must exist, and it must pass the SVG allowlist |
| No scope limit on files | ✘ | The gate only merges PRs adding one new article, plus its own art |
| No kill switch | ✘ | `NUVELLUM_AUTOPUBLISH` variable and `hold` label |
| Rewrote `docs/EDITORIAL_PIPELINE.md` | ✔ the spirit | Rewritten again to match the implemented behaviour |

## Editorial PRs: none are publishable under the final policy

| PR | Story | Risk | Problems | Verdict |
| --- | --- | --- | --- | --- |
| #26 | Tilly Norwood (Deadline) | low | no `editorialReview`; Title Case headline | Hold. Regenerate through the stabilized n8n workflow. Checks ran only because Sam opened the PR by hand. |
| #28 | EU ministers / Olympic bids (DW) | sensitive | **validator fails**: pipeline reviewer without `verification: "cleared"`; source is a DW **live blog** with a `maca` tracking parameter, which is why two unrelated stories were merged into one; "Prepared from Source reporting" placeholder; Title Case; only `action_required` checks | **Close.** Do not publish. |
| #29 | Pope Leo XIV in France (France 24) | low | no `editorialReview`; placeholder `sourceNote`; Title Case; only `action_required` checks | Hold. Regenerate through the stabilized workflow. |

The gate's live read-only evaluation (`DRY_RUN=1 node scripts/auto-publish.mjs`) confirmed all three as HOLD with these reasons. The duplicate guard, also run live, found no duplicate sources among them.

## Incoming branch audit

Output of `scripts/cleanup-merged-branches.mjs` (dry run). Nothing was deleted.

| Branch (prefix) | PR | State | Action |
| --- | --- | --- | --- |
| eu-ministers-meet-in-munich… | #28 | open | keep |
| one-year-on-ai-actress-tilly-norwood… | #26 | open | keep |
| pope-leo-xiv-visits-france… | #29 | open | keep |
| openai-investigates-dozens… (timestamp-named) | #7 | closed unmerged | keep as evidence of the duplicate-branch bug |
| openai-investigating-dozens… | #12 | closed unmerged | keep as evidence |
| fuel-costs…, india-and-pakistan…, iran-proposes…, openai-probes…, police-say…, renewed-fighting…, russia-targeting…, scottish-diesel…, white-house-bars… | #19 #21 #16 #9 #17 #15 #13 #8 #18 | merged | safe to delete via **Actions → Clean up merged editorial branches** (input `yes`) whenever you want; their PRs keep the history |

From now on, the publication gate deletes the branches it merges itself.

## Content finding (not changed)

18 of the 27 published articles are launch placeholders: 12 share one identical body and 6 share another. They are live and indexed, which is a duplicate-content and trust problem. Rewriting published articles is outside this sprint's rules, so they were left untouched and the engines refuse to promote them. **The owner decides:** replace them with real content, set them to `review`, or add `noindex`.
