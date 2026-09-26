# Nuvellum publishing workflow

## v5 intake policy

The production intake should use the diversified source registry in `docs/SOURCE_MATRIX.md`, process up to three candidates per run, prefer different source domains and desks, and compare candidates with both published stories and open editorial pull requests.

The risk classifier must not treat a routine mention of a government department, grant, public service or regulator as sensitive by itself. Politics/elections, conflict, crime, death/serious harm, security/privacy incidents, lawsuits and serious allegations are classified sensitive and must clear the automated second-pass verification before they can be committed.

Crime is now a first-class Nuvellum section. Opinion & Ideas remains human-led rather than automatically rewritten from outside opinion feeds.


Nuvellum is static-first. n8n does not need an admin password, CMS login, or public publishing API.

The production flow is **source → n8n (editorial review + sensitive verification) → GitHub review branch → pull request → checks → merge → Vercel**. Until `NUVELLUM_AUTOPUBLISH` is enabled, a maintainer performs the merge after checks pass.

See `docs/EDITORIAL_PIPELINE.md` for the full architecture.

## Duplicate protection

The workflow should normalize every source URL by removing query strings/fragments before comparison. It must check:
- already-published Nuvellum articles;
- open editorial pull requests;
- other candidates created earlier in the same execution.

Incoming branches should use a deterministic source hash (for example `incoming/<slug>-<source-hash>`) rather than a timestamp. The same source then resolves to the same branch identity instead of generating endless parallel review branches.

GitHub also runs a repository-level duplicate-source guard on editorial PRs, so a second PR using the same normalized source URL is blocked even if n8n misbehaves.

## Core rules

1. Fetch candidate stories from approved sources.
2. Extract verifiable source text and keep the source URL.
3. Draft original copy; do not republish source text.
4. Classify as News / Analysis / Opinion / Review / Explainer / Essay / Ideas.
5. Run duplicate, attribution, factual, legal-risk and quality checks.
6. Build Markdown matching `docs/article-payload.schema.json`.
7. Create the deterministic `incoming/<slug up to 60 chars>-<8-hex source hash>` GitHub branch.
8. Commit `public/generated/ai/<slug>.svg` (when generated) and `src/content/articles/<slug>.md`.
9. Open a pull request against `main`.
10. Let GitHub Actions run content and SVG validation, the duplicate-source guard, dependency audit, CodeQL and the production build.
11. Merge only when every check has passed on the exact head commit.

## Sensitive material

Politics/elections, allegations about identifiable people, crime accusations, armed conflict, sensitive personal data, and serious legal/reputational risk must use:

- `origin: "automation"`
- `risk: "sensitive"`

They start as `status: "review"` and go to a separate, stricter verification pass. Only a clean, explicit pass promotes the story. It is then committed with `verification: "cleared"`, `reviewedBy: "Nuvellum Verification Pipeline"` and `status: "published"`. A failed, uncertain or unparseable verification is never committed. The repository validator rejects any published pipeline story that lacks this metadata. See `docs/EDITORIAL_PIPELINE.md`.

## Low-risk material

Low-risk stories that pass editorial review are committed with `editorialReview: "passed"` and `status: "published"`. They remain offline until the GitHub pull request is merged.

## GitHub credential

Use a fine-grained token limited to the Nuvellum repository. Grant only the permissions needed for repository contents and pull requests. Store it in n8n's credential store, never in the workflow JSON or repository.

## Images

Automated stories get a story-specific SVG illustration, committed as `public/generated/ai/<slug>.svg` and referenced as `/generated/ai/<slug>.svg`. The workflow sanitizes it, and the repository validator re-checks it strictly. If generation or sanitizing fails, the story uses its section artwork under `/images/`. Manually uploaded images still go under `public/uploads/YYYY/MM/`.

## Failure behavior

The workflow should fail closed:

- duplicate check cannot be parsed → skip;
- source text is insufficient → skip;
- article JSON cannot be parsed → skip;
- editorial review cannot be parsed → skip;
- repository validation fails → PR cannot be considered ready;
- build fails → do not merge.

The approved v5.1 homepage baseline remains checksum-protected and cannot be replaced by article automation.
