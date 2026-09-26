# Importing the Nuvellum n8n workflow

The companion workflow export is designed to be imported into n8n and left **inactive** until credentials are selected and a manual test passes.

## Required credentials

### 1. Google Gemini

Use the existing Google Gemini credential for:

- Gemini Duplicate Judge
- Gemini Draft Article
- Gemini Editorial Review

The duplicate and review nodes use Flash Lite; the drafting node uses Flash.

### 2. GitHub HTTP Header Auth

Create a fine-grained GitHub token limited to the Nuvellum repository.

Required repository permissions:
- Contents: Read and write
- Pull requests: Read and write
- Metadata: Read

In n8n create **HTTP Header Auth**:
- Name: `Authorization`
- Value: `Bearer <fine-grained-token>`

Select that credential on:
- Get Main Ref
- Create Review Branch
- Commit Article File

n8n does not need to open or merge the PR. GitHub Actions does both (see `docs/EDITORIAL_PIPELINE.md`). The pushes must come from this credential so that repository checks run.

## First test

1. Keep the Schedule Trigger inactive.
2. Run the workflow from Manual Trigger.
3. Confirm it processes at most six recent feed candidates.
4. Confirm duplicate/rejected stories are skipped.
5. Confirm an accepted story creates an `incoming/...` branch, that Build, Security checks, CodeQL and Editorial duplicate guard run on it, and that a PR opens.
6. Run **Actions → Auto-publish verified editorial stories** with "dry run" to see the gate's decision before enabling `NUVELLUM_AUTOPUBLISH`.
7. Confirm the frontmatter carries `editorialReview` and, for sensitive stories, `verification` exactly as described in `n8n/README.md`.

## Production activation

After one or more clean manual runs, activate the workflow. The template schedule is hourly. Change the interval only after observing API quota and article volume.

## Important

The workflow does not need WordPress credentials and does not contain any API keys. Keep all tokens inside n8n's credential store. Commit the canonical workflow only through `npm run n8n:sanitize` (see `n8n/README.md`).
