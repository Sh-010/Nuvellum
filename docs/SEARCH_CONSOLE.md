# Google Search Console for www.nuvellum.news

Search Console is free and needs no code on the site. Everything below except the sign-in and the DNS record is already in place and checked by the build.

## What the site provides

Host, canonical, robots and RSS were checked against production on 2026-09-30. The World Explorer and World Desk sitemap entries and the empty-desk `noindex` ship with the GA4/Search Console PR.

| Item | State |
| --- | --- |
| Canonical host | `https://www.nuvellum.news`. `nuvellum.news` redirects there with a 308. Every page's `<link rel="canonical">` and `og:url` use it (built from `SITE_URL`). |
| robots.txt | `https://www.nuvellum.news/robots.txt`: allows everything except `/admin` and `/api/`, and names the sitemap. |
| Sitemap | `https://www.nuvellum.news/sitemap.xml`: home, Latest, the publication pages, World Explorer, credits, every published article (with `lastmod`), sections, authors, and every region and country desk that carries reporting. Empty desks are `noindex` and left out. The build fails if the two ever disagree. |
| RSS | `https://www.nuvellum.news/rss.xml` (latest stories; absolute www links) |
| Private pages | `/admin` and `/brief/unsubscribe` are `noindex`, not in the sitemap, and served with `X-Robots-Tag` |

`nuvellum.vercel.app` still serves the site, but its pages declare the www canonical, so Google consolidates onto www.

## Owner steps (needs your Google sign-in)

1. Open https://search.google.com/search-console and add a property.
   - **Domain property** (recommended): enter `nuvellum.news`. Google shows a TXT record. Add it at your DNS host (the registrar or Vercel DNS, wherever `nuvellum.news` is managed) and press Verify. This covers www and every subdomain.
   - Alternative, a **URL-prefix property** for `https://www.nuvellum.news/`: verification by HTML file or meta tag would need a small code change; ask for it.
2. **Sitemaps** → submit `https://www.nuvellum.news/sitemap.xml`.
3. **URL inspection** → test `https://www.nuvellum.news/` and one article, then **Request indexing** for each.
4. Optionally link Search Console to the GA4 property (GA4 → Admin → Product links → Search Console).

Indexing takes days to weeks and is not guaranteed. Do not rely on Search Console numbers until Google reports them. Nothing in this repository claims any page is indexed.

## After submitting

- **Pages**: watch "Crawled, currently not indexed" and "Duplicate without user-selected canonical". The first is normal for a new site; the second would point at a canonical bug.
- **Sitemaps**: the submitted count should roughly match the number of `<loc>` entries in the live sitemap.
- Excluded `/admin`, `/api/*` and `/brief/unsubscribe` are intentional.
