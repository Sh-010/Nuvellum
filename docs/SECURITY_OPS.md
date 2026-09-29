# Security and operations runbook

Every credential Nuvellum uses: where it lives, what breaks when it lapses, and how to rotate it. **Names only.** No value belongs in this repository, in logs or in chat.

## Credential inventory (checked 2026-09-30)

| Credential | Lives in | Used by | Scope | Expiry / rotation | If it lapses |
| --- | --- | --- | --- | --- | --- |
| `NUVELLUM_GITHUB_TOKEN` | Vercel env (Production) | /admin: drafts, PRs, publish/unpublish | Fine-grained PAT, this repo only: Contents RW, Pull requests RW, Actions read, Metadata read (docs/ADMIN.md) | **90 days.** The desk now shows a warning 14 days before expiry (read from GitHub's `github-authentication-token-expiration` header) | /admin can't read or publish; the site stays up |
| n8n credential **"Nuvellum GitHub"** (HTTP header auth) | n8n credential store | Newsroom workflow `8hXx6NuZuJU9dRR1`: 5 GitHub nodes (branch, commit, PR checks) | A GitHub token; check its scope and expiry on GitHub → Settings → Developer settings | Record its expiry here when you next rotate it | The newsroom stops creating incoming branches; nothing is published wrongly |
| n8n credential **"Google Gemini(PaLM) Api account"** | n8n | Newsroom drafting, review, verification, illustration (5 nodes) | Google AI Studio API key | No expiry by default; rotate if exposed | Drafting fails closed (no stories) |
| `NUVELLUM_ADMIN_PASSWORD` | Vercel env | /admin login | — | Rotate if shared or suspected; 16+ characters | — |
| `NUVELLUM_ADMIN_SESSION_SECRET` | Vercel env | Signs admin sessions and CSRF | 32+ random characters | Rotating it logs everyone out (harmless) | — |
| `NUVELLUM_BRIEF_SECRET` | Vercel env | Brief subscriber keys and unsubscribe signatures | 32+ random characters | **Do not rotate casually.** It orphans the list and breaks every unsubscribe link already sent. Rotate only on exposure, together with an export and re-import. | Sign-ups say "not open yet" |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel env (added by the Upstash integration) | Brief storage | Upstash database | Rotate in the Upstash console; Vercel updates the variables | Sign-ups answer "briefly unavailable" |
| `NUVELLUM_GA4_ID` | Vercel env | Analytics (not a secret) | — | — | Analytics stop |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `FACEBOOK_*`, `LINKEDIN_*`, `X_*` | GitHub Actions secrets | Social publish | Per docs/SOCIAL_DISTRIBUTION.md | Telegram: no expiry (revoke via @BotFather). Meta/LinkedIn tokens expire (about 60 days); record the dates. | That platform records `failed`/`skipped`; publishing is unaffected |
| `GITHUB_TOKEN` (automatic) | GitHub Actions | Auto-publish merges, auto-open PRs, ledger pushes | Per-workflow `permissions:` | Issued per run | — |

**Unused n8n credentials, for your review:** "WhatsApp account", "WhatsApp OAuth account", "Wordpress account", "Unnamed credential" (basic auth), "Header Auth account" and "Header Auth account 2". None is used by the production workflow. Each is a live secret with no purpose. Delete them in n8n → Credentials if nothing else uses them. That is not done here, because deleting is irreversible and they may serve other workflows.

## Rotating the GitHub tokens

1. GitHub → Settings → Developer settings → Fine-grained tokens → **Regenerate** (keeps the scopes), or create a new token with the same permissions (docs/ADMIN.md).
2. Admin token: Vercel → Project → Settings → Environment Variables → edit `NUVELLUM_GITHUB_TOKEN` (Production) → **Redeploy**. Open /admin and check the queue loads and the expiry warning has gone.
3. n8n token: n8n → Credentials → "Nuvellum GitHub" → replace the header value (`Bearer …`). Run the workflow once manually and check one incoming branch appears.
4. Revoke the old token once both work, and write the new expiry date in your calendar.

## Branch hygiene

`Clean up merged branches` (Actions, manual only) is **a dry run unless you type `yes`**.
- **Scope.** `incoming` (the default) covers editorial branches; `all` covers every merged feature branch.
- **What it deletes.** Only branches whose PR was merged and whose tip is still the merged commit.
- **What it keeps:**
  - branches with an open PR;
  - branches that are the base of an open (stacked) PR;
  - branches closed without merge (kept as evidence);
  - branches with no PR;
  - `main` and `social-ledger`.
- **Undo.** A deleted branch can be restored from its PR page.

Read-only dry run on 2026-09-30 (`all`): 92 branches.
- **61 would be deleted**: merged, with an unchanged tip.
- 31 would be kept: 11 with open PRs, 10 closed unmerged, 9 with no PR, and `main`.

Nothing was deleted.

## Standing rules

- Secrets only in Vercel env, GitHub Actions secrets or the n8n credential store. Never in the repo, the browser, logs or chat.
- The admin API never returns a secret. GitHub errors reach the browser only as fixed human messages.
- Social and Brief errors are trimmed, and any credential value is redacted before it is stored or logged.
- `NUVELLUM_AUTOPUBLISH` stays `off` until you decide otherwise.
- The n8n workflow `8hXx6NuZuJU9dRR1` is the only production newsroom. Fix it in place, after a backup.
