# Nuvellum publishing workflow

## v5 intake policy

The production intake should use the diversified source registry in `docs/SOURCE_MATRIX.md`, process up to three candidates per run, prefer different source domains and desks, and compare candidates with both published stories and open editorial pull requests.

The risk classifier must not treat a routine mention of a government department, grant, public service or regulator as sensitive by itself. Politics/elections, conflict, crime, death/serious harm, security/privacy incidents, lawsuits and serious allegations remain human-review material.

Crime is now a first-class Nuvellum section. Opinion & Ideas remains human-led rather than automatically rewritten from outside opinion feeds.


Nuvellum is static-first. n8n does not need an admin password, CMS login, or public publishing API.

The production flow is **source → n8n → `incoming/**` branch → checks → automatic PR → publication gate → Vercel**.

The canonical workflow lives in `n8n/workflows/`. Its contract is in `n8n/README.md`, and the publication policy is in `docs/EDITORIAL_PIPELINE.md`.

See `docs/EDITORIAL_PIPELINE.md` for the full architecture.

## Duplicate protection

The workflow should normalize every source URL by removing query strings/fragments before comparison. It must check:
- already-published Nuvellum articles;
- open editorial pull requests;
- other candidates created earlier in the same execution.

Incoming branches should use a deterministic source hash (for example `incoming/<slug>-<source-hash>`) rather than a timestamp. The same source then resolves to the same branch identity instead of generating endless parallel review branches.

GitHub also runs a repository-level duplicate-source guard on every push to `incoming/**`, so a second in-flight branch using the same normalized source URL fails its checks and cannot be published even if n8n misbehaves.

## Core rules

1. Fetch candidate stories from approved sources.
2. Extract verifiable source text and keep the source URL.
3. Draft original copy; do not republish source text.
4. Classify as News / Analysis / Opinion / Review / Explainer / Essay / Ideas.
5. Run duplicate, attribution, factual, legal-risk and quality checks.
6. Build Markdown matching `docs/article-payload.schema.json`.
7. Create the `incoming/<slug>-<source-hash>` GitHub branch.
8. Commit `src/content/articles/<slug>.md` and, optionally, `public/generated/ai/<slug>.svg`.
9. GitHub Actions runs content validation, the SVG safety check, dependency audit, CodeQL, the duplicate guard and the production build on the pushed commit.
10. GitHub opens the PR automatically. The publication gate merges it only if the story is cleared and every check is green.

## Sensitive material

Politics/elections, allegations about identifiable people, crime accusations, armed conflict, sensitive personal data, and serious legal/reputational risk use `risk: "sensitive"`.

A sensitive story may be published automatically only when the dedicated verification pass explicitly cleared it:

- `editorialReview: "passed"`
- `verification: "cleared"`
- `reviewedBy: "Nuvellum Verification Pipeline"`
- `status: "published"`

A failed or uncertain verification means `status: "review"`, and the story never publishes.

## Low-risk material

Low-risk stories need `editorialReview: "passed"` and `status: "published"`. They publish automatically once every repository check is green.

See `docs/EDITORIAL_PIPELINE.md` for the full gate, the kill switch (`NUVELLUM_AUTOPUBLISH`) and the `hold` label.

## GitHub credential

Use a fine-grained token limited to the Nuvellum repository. Grant only the permissions needed for repository contents and pull requests. Store it in n8n's credential store, never in the workflow JSON or repository.

## Images

- Story-specific AI art: `public/generated/ai/<slug>.svg`, referenced as `image: "/generated/ai/<slug>.svg"`. It must pass the strict SVG safety check in `scripts/lib/svg-safety.mjs`.
- Otherwise use the section artwork (`/images/<section>.svg`) or approved files under `public/uploads/YYYY/MM/`. Automated stories without custom art get a build-time illustration.

## Failure behavior

The workflow should fail closed:

- duplicate check cannot be parsed → skip;
- source text is insufficient → skip;
- article JSON cannot be parsed → skip;
- editorial review cannot be parsed → skip;
- verification failed or uncertain → never published;
- repository validation fails → the gate will not merge;
- build fails → the gate will not merge.

The approved v5.1 homepage baseline remains checksum-protected and cannot be replaced by article automation.
