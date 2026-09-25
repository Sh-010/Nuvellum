# Nuvellum no-cost launch checklist

The publication can launch and operate on `https://nuvellum.vercel.app` without buying a domain. A custom domain is a branding/portability upgrade, not a launch blocker.

## Already implemented in the repository

- Exact checksum-pinned v5.1 visual baseline.
- Static-first production architecture.
- Real article and section routes.
- Sitemap, RSS, robots.txt and canonical metadata.
- Open Graph / social preview metadata.
- Article content validation before builds.
- Markdown-only article body policy to reduce XSS risk.
- Vercel security headers and CSP.
- GitHub Actions build checks.
- Dependency auditing, Dependabot and CodeQL.
- n8n-compatible Markdown publishing contract.
- Backup/recovery branches.

## Free / account-side switches still required

These cannot be safely enabled by repository code alone because they belong to third-party account settings or need credentials.

### Vercel Web Analytics

Vercel requires Web Analytics to be enabled in the project dashboard before its analytics route exists. Keep this disabled in code until the dashboard switch is enabled and the final integration is tested against the CSP.

### Newsletter

The v5.1 newsletter box remains visible, but the production build deliberately does **not** pretend an address was subscribed. Connect a real newsletter provider before storing addresses. Do not commit newsletter API keys to GitHub.

### Search Console

A URL-prefix property for `https://nuvellum.vercel.app/` can be used before a custom domain exists. When a custom domain is eventually added, create/verify the permanent property and update `SITE_URL`.

### n8n publishing

Store the GitHub credential inside n8n's credential store. Give it only the repository permissions needed to create/update article files. Sensitive stories should go to a review branch instead of directly to `main`.

### Social distribution

Keep Facebook/X/LinkedIn tokens in n8n or the provider's secret store, never in article frontmatter, workflow JSON committed to GitHub, or browser JavaScript.

## When a custom domain becomes affordable

1. Buy the domain.
2. Attach it to the Vercel project.
3. Set `SITE_URL` to the new HTTPS origin.
4. Redeploy.
5. Verify canonical tags, sitemap, RSS and social previews.
6. Add the domain to Search Console.
7. Keep the `vercel.app` deployment as a redirect/backup rather than creating duplicate indexed content.
