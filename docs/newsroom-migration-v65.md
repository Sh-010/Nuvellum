# Nuvellum newsroom — production operations

**Production launch:** 20 October 2026, [PR #589](https://github.com/Sh-010/Nuvellum/pull/589).

## How it works

The GitHub Actions newsroom workflow is scheduled **every 15 minutes**, at minutes 02, 17, 32, and 47 (UTC), subject to GitHub scheduling delays. It collects stories from 27 RSS feeds, chooses at most five candidates, uses Gemini 3.5 Flash-Lite for deduplication, source-based drafting, editorial checking and sensitive-story verification, then writes **no more than one** qualified article to an incoming branch.

A hard ceiling of **six Gemini HTTP attempts per run (including retries)** guards usage. API-quota errors or no acceptable story mean the run can publish nothing. Sensitive reporting still requires human approval. The previous n8n SVG-generation stage has not been migrated; suitable licensed photography and text-led layouts remain available.

The existing GitHub newsroom automation creates a PR, runs the image, duplicate, build, security and CodeQL checks, and publishes qualified low-risk stories. The publication gate enforces a **minimum 12-minute gap** between automatic merges and a default and absolute ceiling of **72 published articles per rolling 24 hours**, leaving headroom beneath Vercel Hobby's 100-deployments/day limit. 15-minute execution does not guarantee a new article every run; editorial failures, no new stories, GitHub scheduling drift and quota limits are legitimate skips.

## Launch verification

- The 27 RSS feeds delivered 509 recent items without errors in a test.
- The Gemini key and dry-run article generation worked.
- A review-only candidate progressed to [PR #588](https://github.com/Sh-010/Nuvellum/pull/588), was independently edited against its original reporting, then passed required PR checks.
- The existing auto-publish gate merged it at [commit ce489b8](https://github.com/Sh-010/Nuvellum/commit/ce489b8aacc2fb075e6a9f7f72463d69eaea03f3).
- The production [Christian Horner article](https://www.nuvellum.news/article/christian-horner-says-toto-wolff-finds-formula-1-easier-without-him) is publicly visible and included in Nuvellum's search index; Vercel reported a successful deployment.
- Release-branch tests and Build Nuvellum, Security checks, CodeQL passed.

## Emergency stop

For **hourly article generation**, visit GitHub repository **Settings → Secrets and variables → Actions → Variables** and set the repository variable `NUVELLUM_NEWSROOM_LIVE` to `off`. This prevents scheduled newsroom runs. Remove the variable or give it a different value to resume.

For **all automatic editorial merging** including already-queued PRs, also set `NUVELLUM_AUTOPUBLISH` to `off`. This is a separate independent publication switch; pausing just the hourly generator does not stop the publishing gate from processing queued PRs.

Never paste API keys into files or pull requests. GitHub Actions uses secrets `NUVELLUM_GEMINI_API_KEY` and `NUVELLUM_DEPLOY_KEY`.

## Operating limits

Gemini pricing includes a free API tier, but the actual account's project-wide request quotas and billing status cannot be inferred from a successful test. Inspect **Google AI Studio → Usage and billing**; free usage is not a guarantee that a paid-enabled project will incur zero charges.

GitHub scheduled jobs can be delayed or skipped, and stories failing validation are deliberately not published. The verified publication test does **not** prove that every future hourly run will produce an article. Monitor GitHub Actions > Nuvellum newsroom migration for actual runs and issues. The new 15-minute scheduled cadence should be observed after deployment.
