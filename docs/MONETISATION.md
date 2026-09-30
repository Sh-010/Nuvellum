# Monetisation readiness: AdSense, sponsorship, media kit

Audited 2026-09-30 against production (www.nuvellum.news) and the repository. **No ads, billing or paid services are enabled.** Nothing below states or implies an audience figure; none has been measured yet.

## 1. AdSense readiness audit

| Area | State | Evidence / what is missing |
| --- | --- | --- |
| HTTPS, one canonical host, mobile layout | ✅ Ready | www canonical; apex 308; no horizontal overflow from 320 to 1440 px (checked in Chrome) |
| Trust pages | ✅ Ready | About, Contact (sam@nuvellum.news), Privacy, Terms, Editorial Standards, Corrections, Image credits: all 200 |
| Navigation without dead ends | ✅ Ready | After the content-cleanup PR every nav section resolves (empty ones say so), and the build fails on any broken story link |
| Placeholder content | ✅ Fixed | The 18 boilerplate "launch" articles are unpublished (content-cleanup PR). Google rejects placeholder and template pages. |
| Image rights | ✅ Ready | Photos are openly licensed with the credit on the page and on /credits; no scraped images |
| **Content value** | ❌ **Main risk** | 33 published stories, a median of **293 words**, 32 of them "News" and almost all machine-drafted from other outlets' reporting. Google's spam policies treat *scaled content made primarily to rank or monetise without adding value* as abuse, and AdSense's commonest rejection is "low value content". Summarising other outlets without adding anything new is the textbook case. Before applying: add original work (analysis, explainers, reported pieces, and the Brief), lengthen and human-edit the automated news, and keep publishing on a steady cadence for several weeks. |
| **Transparency about automation** | ⚠️ Partly | /standards explains machine-assisted drafting, but individual automated articles say nothing about it. **Recommendation (owner decision; it changes the article page):** a one-line "How this story was made" note on automated stories, linking to /standards. |
| Named editorial accountability | ⚠️ Recommended | Bylines are desks ("Nuvellum Global Desk"). Name a responsible editor on /about and /standards. |
| **Consent for ads (UK/EEA/CH readers)** | ❌ **Blocker for ads in the UK/EEA/CH** | Google requires a **Google-certified CMP integrated with IAB TCF** to serve ads to users in the EEA and UK (since 16 Jan 2024) and Switzerland (since 31 Jul 2024), and TCF v2.2 strings stopped being supported after 28 Feb 2026 (v2.3 needed). The consent-first GA4 notice (Phase 4) is **not** a certified CMP. Free route: AdSense's own **Privacy & messaging** consent message, when AdSense is set up. Whatever CMP is chosen must then also gate GA4. |
| Privacy policy for ads | ❌ To do when applying | It must name Google as an advertising vendor using cookies, link to Google's "How Google uses information from sites that use our services" and ads settings, and explain the consent choice. |
| ads.txt | ⏸ Ready to switch on | `scripts/write-ads-txt.mjs` writes `/ads.txt` (`google.com, pub-…, DIRECT, f08c47fec0942fa0`) only when `NUVELLUM_ADSENSE_PUB_ID` is set in Vercel. Today no ads.txt is served, which is correct without ads. |
| Ad placements | ⏸ Not designed | Placements must respect the approved v6 design. Propose them as a design change only after approval. No auto-ads on /admin, /brief/* or the World Explorer canvas. |

**Verdict:** the site is *technically* ready (pages, HTTPS, no broken paths, licensed images). It is **not content-ready**: thin, largely automated, derivative news is the most likely rejection reason. Applying now risks a "low value content" rejection. Revisit after several weeks of original and edited work.

Sources: [Google consent management requirements for serving ads in the EEA, UK and Switzerland (AdSense Help)](https://support.google.com/adsense/answer/13554116?hl=en), [New CMP requirements for serving ads in the EEA and UK (Google blog)](https://blog.google/products/adsense/new-consent-management-platform-requirements-for-serving-ads-in-the-eea-and-uk/). The approval-quality points reflect Google Search's spam policies on scaled content plus third-party AdSense guides ([adsenseaudit.net on AI content](https://adsenseaudit.net/guides/adsense-ai-content-policy-2026), [ILLUMINATION rejection fixes](https://medium.com/illumination/google-adsense-rejection-fixes-2026-get-approved-after-multiple-rejections-aab43931f654)); treat those as guidance, not Google policy.

## 2. Sponsorship model (proposal, no prices)

Direct sponsorship fits Nuvellum better than programmatic ads at this size. It needs no CMP for third-party ad tech and no traffic threshold, and it suits a premium identity. It has to be sold on real numbers, so none are quoted until measured.

| Product | What the sponsor gets | Label (always visible before engagement) | Editorial rule |
| --- | --- | --- | --- |
| **Brief sponsorship** | One sponsor line and link per issue of the Nuvellum Brief | "Supported by [Sponsor]" | The sponsor never sees or influences the issue's content |
| **Section sponsorship** | A "Presented by" mark on one section front (e.g. Technology) for a fixed period | "Section presented by [Sponsor]" | No sponsor influence on what the section covers |
| **World Explorer sponsorship** | A credit line on the World Explorer page | "World Explorer supported by [Sponsor]" | Data and story selection unchanged |
| **Partner content** | A clearly separate article written for or with the sponsor | "Paid partner content" kicker plus a disclosure line; never in News/World rails | Not produced by the newsroom pipeline; noindex or `rel="sponsored"` links as appropriate |

Pricing basis, once the data exists: a flat period rate for section and Explorer sponsorships; a per-issue rate for the Brief (from active subscribers, opens and clicks in the provider); partner content from production cost plus guaranteed promotion. **No CPM or reach claims** until GA4 has at least 60–90 days of consented data.

The /advertise page already states the separation principle and the "no promises we can't measure" rule; it needs no change now.

## 3. Media kit groundwork

- `npm run media-kit` prints publication facts computed from the repository only: published stories, cadence (7/30 days), sections, formats, median length and visual mix. Its `audience` field reads "not yet measured" by design; a test fails if audience figures ever appear in it.
- The audience figures to add later, **each only from its source of truth**:
  - users, page views, top sections and countries: GA4, consented traffic only; state that it undercounts;
  - Brief active subscribers: /admin → Brief;
  - opens and clicks: the sending provider;
  - social followers: the platform insights.
- Every figure in a media kit must carry its source and date range.

Current facts (2026-09-30, `npm run media-kit`): 33 published stories since 2026-09-25; median 293 words; World 14, Film & TV 7, Technology 4, Business 3, Gaming 3, Sports 2; News 32, Explainer 1; licensed photo 27, text-led 6. Audience: not yet measured.
