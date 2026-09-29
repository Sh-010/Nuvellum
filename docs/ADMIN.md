# Nuvellum admin: editorial control room

`https://www.nuvellum.news/admin` is the private editorial desk. Sam can review newsroom stories, write and edit stories, preview them, pass the editorial gates, publish through the repository's checks, and unpublish. None of it needs GitHub, n8n or a terminal.

It is not a second publishing system. Both paths end in the same place:

```
newsroom (n8n) ── incoming/<slug>-<hash> ──┐
                                            ├─> PR -> required checks -> main -> Vercel
admin dashboard ── manual/<slug>-<stamp> ───┘
```

Articles stay Markdown files in `src/content/articles/`. Nothing is stored in a database.

## Setup (Vercel)

Set these in the Vercel project (Production, plus Preview if you want the admin on previews). Never commit their values.

| Variable | What it is |
| --- | --- |
| `NUVELLUM_ADMIN_PASSWORD` | Sam's admin password. At least **16** characters; use a long random passphrase. |
| `NUVELLUM_ADMIN_SESSION_SECRET` | Signs session cookies. At least **32** random characters (for example `openssl rand -base64 48`). Changing it logs everyone out. |
| `NUVELLUM_GITHUB_TOKEN` | A **fine-grained** personal access token (see below). |

If a variable is missing or too short, every admin endpoint answers `503 The admin is not configured` and nothing else happens.

### GitHub token

Create it at GitHub → Settings → Developer settings → Fine-grained tokens:

- **Resource owner:** `Sh-010`. **Repository access:** *Only select repositories* → `Sh-010/Nuvellum`.
- **Expiration:** 90 days, with a calendar reminder to rotate it.
- **Repository permissions**, all others left at *No access*:
  - **Contents: Read and write**: branches, commits, merging.
  - **Pull requests: Read and write**: opening PRs, review labels and notes, closing rejected PRs.
  - **Actions: Read-only**: reading the check results shown in the dashboard.
  - **Metadata: Read-only**: required by GitHub.

The token belongs to Sam's account. Branch protection on `main` (required checks, enforced for admins) still applies to every merge the dashboard makes. The token needs no Workflows, Secrets, Administration or Issues permission.

## How it works

- **`/admin`** is a static page (`src/pages/admin.astro`) with no data and no secrets. It is `noindex, nofollow`, disallowed in `robots.txt`, absent from the sitemap, not linked from the site, and loads no analytics. That is hygiene only; the protection is server-side.
- **`/api/admin?action=…`** is one Vercel Function (`api/admin.js`). The logic is in `scripts/lib/admin/`:
  - `auth.mjs`: password check, signed session cookie, CSRF, login throttle.
  - `github.mjs`: the only code that talks to GitHub, with a restricted write scope.
  - `editor.mjs`: form → article, validation, gates, publication state, queue columns.
  - `images.mjs`: upload validation.
  - `render.mjs`: the safe preview renderer.
  - `handler.mjs`: HTTP routing and authorisation.
- **The article contract** is `scripts/lib/article-rules.mjs`, shared with `scripts/validate-content.mjs`. The dashboard and CI apply the same rules and the same vocabularies (sections, types, statuses, regions). Stories created in the dashboard get `origin: "manual"`.

## Editorial flow

| Action | What happens on GitHub |
| --- | --- |
| **Save draft** | Commits the story (status `draft`) to `manual/<slug>-<yyyymmddhhmmss>`. No PR, so nothing is public. |
| **Submit for review** | Commits status `review` and opens a PR. The required checks run. |
| **Prepare publication** | Commits status `published`, once the gates pass in the form. Checks run on that exact commit. |
| **Publish now** | Enabled only when every required check is green on the PR head and the gates pass. The server re-validates the story, the gates, the file scope and the checks on that commit, then squash-merges. Vercel deploys `main`. |
| **Unpublish…** | You type the slug to confirm. The status becomes `draft` and `updated` is set on a new branch, which goes through the same checks. The file and its history are kept; nothing is deleted. |
| **Discard draft…** | Deletes an unpublished `manual/` branch and closes its PR. It never touches `main`. |

Editing a published story records `updated`. Each save names the version it started from. If the story changed in the meantime (on `main` or on its branch), nothing is written and the editor asks you to reload.

### Gates (also enforced by the repository validator for `origin: "manual"`)

- **Low risk:** `editorialReview: "passed"`.
- **Sensitive:** `editorialReview: "passed"`, `verification: "cleared"` and a named `reviewedBy`. The name `Nuvellum Verification Pipeline` is reserved for the automated verifier.

The dashboard never records review or verification on its own; you set each value. Opinion, Essay, Ideas and Review stay human-led: they publish only through this manual path.

### Review Queue (newsroom stories)

Open `incoming/**` PRs and dashboard PRs appear in five columns:

- **Pending Review:** gates not met, or checks failed.
- **Checks Running:** approved; checks in progress.
- **Ready to Publish:** gates met and all required checks green.
- **Published:** recently merged.
- **Held / Rejected:** a `hold`, `needs-human` or `rejected` label, or closed with a rejection.

From a newsroom story Sam can:

- read the whole story and its source links, and preview it
- edit it (the slug cannot change)
- approve review, clear verification with his name, and publish once the checks are green

He can also hold or release it, send it back (the `needs-human` label plus his note), or reject it (the `rejected` label, his note, and the PR closed).

Hold labels are the same ones the auto-publish gate already honours, so a held story is not merged automatically either. Newsroom PRs must also pass **Acquire editorial visual**.

Dashboard edits on a newsroom branch are committed as `editor: …`, and the licensed-image pass (`visual-acquire.yml`) skips those commits. An editor's text-led or image decision is therefore not overwritten.

## Images

- **Upload:** JPEG, PNG or WebP only, at most 3 MB and at least 600 px wide. The type is checked from the file's bytes, and the name and the browser's claimed type must agree. SVG is refused.
- Uploads are stored as `public/uploads/articles/<slug>.<ext>` in the same commit as the story.
- An https image URL or an existing `/uploads/articles/…` file can be used instead, or the story can be text-led with no image.
- Credit, licence and source fields are recorded only as entered. On the article page, manual images show exactly the recorded caption and credit, never a stock label.

## Security notes

- **Session:** `__Host-nuvellum_admin` cookie, `HttpOnly; Secure; SameSite=Strict`, signed with HMAC-SHA256, 8-hour expiry checked on the server. Logging out clears it.
- **Writes:** every write needs the session, a same-origin `Origin`, JSON, and a CSRF token bound to the session.
- **Login:** the password is compared in constant time. Failures are delayed, and after 5 in 15 minutes the client is throttled (per function instance).
- **GitHub scope:**
  - one repository only (hard-coded);
  - branches `manual/<slug>-<stamp>`, plus existing `incoming/**` branches, which the admin never creates or deletes;
  - files: the story's own `src/content/articles/<slug>.md` and `public/uploads/articles/<slug>.<jpg|png|webp>`.
- **Merge limits:** the dashboard never merges a PR that changes anything else, is held, has failed or pending checks, or whose head moved since the checks you saw.
- **Content:** raw HTML and unsafe link schemes (`javascript:`, `data:` and similar) are refused by the shared contract, which now checks every article in CI. The preview escapes all text and renders in a sandboxed iframe with scripts disabled.
- **Errors:** GitHub's error bodies are logged server-side only; the browser gets short, fixed messages.

## Local tests

`npm test` covers authentication, anonymous access, session expiry, CSRF, slugs, serialization, vocabularies, unsafe Markdown, images, both gates, branch and path restrictions, stale-edit protection, the full publish, unpublish and newsroom-review flows, and queue columns. Tests use an in-memory GitHub, so no network is needed.
