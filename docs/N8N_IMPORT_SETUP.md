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
- Open Editorial PR

## First test

1. Keep the Schedule Trigger inactive.
2. Run the workflow from Manual Trigger.
3. Confirm it processes at most six recent feed candidates.
4. Confirm duplicate/rejected stories are skipped.
5. Confirm an accepted story creates an `incoming/...` branch and a pull request.
6. Do not merge until the GitHub Build, Security checks and CodeQL checks pass.
7. For a sensitive PR, confirm the article carries `verification: "cleared"` and `reviewedBy: "Nuvellum Verification Pipeline"`. Stories that fail verification never reach GitHub.

## Production activation

After one or more clean manual runs, activate the workflow. The template schedule is hourly. Change the interval only after observing API quota and article volume.

## Important

The workflow does not need WordPress credentials and does not contain any API keys. Keep all tokens inside n8n's credential store.
