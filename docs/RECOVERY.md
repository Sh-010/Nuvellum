# Recovery and rollback

Nothing here requires force-pushing or rewriting history.

## Stop automated publishing immediately

1. GitHub → **Settings → Secrets and variables → Actions → Variables**: set `NUVELLUM_AUTOPUBLISH` to `off`. The gate then only evaluates.
2. To stop a single story, label its PR `hold`.
3. In n8n, deactivate the schedule trigger.

## Remove a published story

Open a normal PR that sets the article's `status` to `review`, or reverts the publishing commit (`git revert <sha>`), and merge it. Vercel redeploys `main`. If the URL was indexed, add a redirect in `vercel.json` or keep the page with a correction note, following the corrections policy.

## Roll production back to a known-good state

- **Fastest:** in Vercel → Deployments, promote the previous good deployment. This doesn't change Git.
- **In Git:** `git revert` the offending merge commits on a branch, open a PR, and merge. Revert rather than resetting `main`.

Known-good references:

| Ref | What |
| --- | --- |
| `checkpoint-pre-stabilization-2026-09-26` (tag) and `checkpoint/pre-stabilization-2026-09-26` (branch) | `main` at `c14b931`, before the 2026-09-26 stabilization |
| `nuvellum-v5.1-production-baseline` | First verified live deployment of the exact v5.1 design |
| `backup-pre-v51-2026-09-25` | Pre-restoration Astro homepage |

## The build fails with a v5.1 checksum mismatch

`assets/nuvellum-v5.zip` was modified. Restore it from any recovery ref:

```bash
git checkout nuvellum-v5.1-production-baseline -- assets/nuvellum-v5.zip
```

Never "fix" this by changing the checksum.

## A secret was committed or exposed

1. **Rotate the key at the provider first.**
2. Remove it in a normal commit.
3. Tell the owner. Don't rewrite history without the owner's explicit decision; a rotated key is harmless.

## n8n workflow broken

Re-import the last good `n8n/workflows/nuvellum-newsroom.json` into n8n, re-bind credentials by name, test it manually while the schedule is inactive, then reactivate.
