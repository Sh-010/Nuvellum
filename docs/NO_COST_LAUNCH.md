# Nuvellum launch and operating checklist

Current production host: **https://www.nuvellum.news**. The old no-domain launch assumptions in this file are obsolete; the custom domain, production publication, Brief and distribution engines now exist.

## Operational now

- Approved Nuvellum production design and interaction system.
- Static-first Astro site on Vercel with the canonical `www.nuvellum.news` host.
- Real article, section, Latest, Saved, World Explorer, region, country and institutional routes.
- Sitemap, RSS, robots.txt, canonical metadata, Open Graph/Twitter metadata and Article JSON-LD.
- Content validation, duplicate protection, security checks and CodeQL.
- Canonical n8n newsroom with editorial and sensitive-story verification gates.
- Conservative licensed-photo acquisition with text-led fallback.
- GitHub publication gate and kill switch (`NUVELLUM_AUTOPUBLISH`).
- Nuvellum Brief consent storage, Resend synchronisation, unsubscribe lifecycle and unattended daily sender.
- Social distribution/copy/card engines and posting ledger.
- Shorts/Reels renderer with captions and local TTS.
- Reader-analytics plumbing with consent-first GA4 loading.
- Newsroom observability plus recurring live production smoke checks.
- Recovery and branch-cleanup tooling.

## Account-side work that repository code cannot finish

These are external-account operations, not missing application code.

### Google

- Verify the permanent `nuvellum.news` property in Search Console and submit `/sitemap.xml`.
- Ensure the GA4 web stream measurement ID is present in Vercel Production and confirm live events after consent.
- Optionally link Search Console to GA4.

### Social platforms

Keep `NUVELLUM_SOCIAL` off until the intended accounts and developer apps are connected.

- Meta: Facebook Page / Instagram Professional account, app permissions and any required review.
- TikTok: developer app, Content Posting API and audit for public automated posting.
- YouTube: OAuth/client setup and API compliance requirements for public uploads.
- LinkedIn: Company Page/API approval where applicable.
- X: paid API budget decision before enabling linked-post automation.
- Telegram: bot/channel credentials if Telegram publishing is desired.

Secrets belong in GitHub Actions secrets, Vercel environment variables, n8n credentials or the provider's secret store. Never commit them.

### Autopublish

The publication gate is implemented. Turning `NUVELLUM_AUTOPUBLISH=on` is an owner policy decision, not an engineering task. Keep it off if every article should still receive a manual merge decision.

## What is deliberately not a launch blocker

- Paid image-generation APIs.
- Programmatic ads.
- X API spend.
- Fully automatic public Shorts/Reels uploads.
- A large audience or sponsorship inventory.

The publication should accumulate original analysis/explainers, audience history and operational reliability before AdSense or aggressive monetisation is treated as a priority.

## Production acceptance rule

The core is considered healthy when:

1. required GitHub checks are green;
2. Vercel's current production deployment is healthy;
3. the recurring production smoke audit reports no failures for sitemap routes and public images;
4. Brief and newsroom failures remain isolated from the public site;
5. no unresolved release-blocking PR is open.

When those conditions hold, stop changing the core merely to make it "more finished". Work should move to reporting, distribution, original editorial output and audience growth.
