# Social platform connection checklist

The publishing software for every platform below is **built and tested**:
- feed posts: `engines/publish/adapters.mjs`;
- Shorts/Reels: `engines/publish/video.mjs`, through the Shorts autopilot. That autopilot is currently a manual fallback: no automatic public video posting, by owner decision. See docs/SHORTS_ENGINE.md.

What remains for each platform is account-side: credentials, and in some cases the platform's own review. Each adapter stays dormant, recording `skipped` / `blocked_credentials` / `blocked_external_approval`, until its secrets exist. One platform's state never affects another.

## Current status (1 October 2026)

| Platform | Feed post | Short/Reel | Live today? | What unblocks it (owner side) |
| --- | --- | --- | --- | --- |
| **Telegram** | Branded square card + caption | — | **Yes**, every 3 hours, ledger-backed, no duplicates | Nothing |
| **Facebook Page** | Link post | Reels via `video_reels` | No: no secrets | Meta app with `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`; long-lived Page token → `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN`. Advanced Access needs App Review + Business Verification (**external approval**). |
| **Instagram** | Portrait card (JPEG) | Reels | No: no secrets | Professional account linked to the Page; `instagram_content_publish` (App Review, **external approval**) → `INSTAGRAM_USER_ID`, `INSTAGRAM_TOKEN` |
| **Threads** | Text + link | — | No: no secrets | `threads_basic`, `threads_content_publish` (App Review, **external approval**) → `THREADS_USER_ID`, `THREADS_TOKEN`. The token lasts 60 days: renew it, and the owner alert fires on rejection. |
| **LinkedIn Page** | Article post | — | No: no secrets | Community Management API approval, which is open only to a registered legal entity (**external approval**) → `LINKEDIN_ORG_URN`, `LINKEDIN_TOKEN` (60-day token) |
| **YouTube** | — | Shorts upload | No: no secrets | Google Cloud project, YouTube Data API v3, OAuth client, refresh token for the channel → `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`. Put the OAuth consent screen **In production**: refresh tokens of "Testing" apps expire after 7 days. Until Google's API compliance audit, uploads are locked private, and the ledger records them as `awaiting_approval` (**external approval**). |
| **TikTok** | — | Direct Post (file upload) | No: no secrets | Developer app with Content Posting API → `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`. Public posting needs TikTok's **audit**; then set the variable `TIKTOK_AUDITED=yes`. Until then: `blocked_external_approval`. |
| **X** | Text + link | — | No: deliberately off | Paid API (about $0.20 per linked post). Needs a budget decision (`NUVELLUM_X_BUDGET_APPROVED=yes`). Not a launch dependency. |

**Third-party schedulers are not part of the architecture.**
- **Metricool:** API access requires the paid Advanced plan (from about $53/month); the Free and Starter plans have no API.
- **Windsor.ai:** a data-integration product whose free tier, after a 30-day trial, is limited to one source.

Accounts connected inside those tools can still be used by hand. Nuvellum's automation never depends on them.

Media is served publicly from the `social-assets` branch (the repository is public), through jsDelivr's free GitHub CDN. jsDelivr returns proper `image/jpeg` / `video/mp4` types, which the Meta APIs require; raw.githubusercontent.com answers `application/octet-stream`. Override the base with the variable `NUVELLUM_ASSET_BASE` if needed:
- `https://cdn.jsdelivr.net/gh/Sh-010/Nuvellum@social-assets/cards/<slug>/portrait.jpg`
- `https://cdn.jsdelivr.net/gh/Sh-010/Nuvellum@social-assets/shorts/<slug>/short.mp4`

Instagram and Facebook Reels fetch from these URLs. YouTube and TikTok receive the bytes directly, so no TikTok domain verification is needed.

All secrets go in GitHub → Settings → Secrets and variables → Actions → **Secrets**. Variables (`NUVELLUM_SOCIAL`, `TIKTOK_AUDITED`, `NUVELLUM_X_BUDGET_APPROVED`, `YOUTUBE_PRIVACY`) go under **Variables**.

## Background

Checked against the platforms' developer documentation in **September 2026**. These terms change often.

### Requirements shared by every platform

- **Rasterised media.** Done: cards are rasterised in Chromium to PNG, with the Instagram portrait card also as JPEG, and published to `social-assets`.
- **Public media URLs.** Done: the public `social-assets` branch (see above).
- **Secret storage.** Keep all tokens in GitHub Actions secrets (or n8n credentials), never in the repo. Record each token's expiry and who can refresh it.
- **Editorial gates.** Only stories that passed the publication gate are ever posted. Sensitive stories never get automatic Shorts.

### Per platform

| Platform | Account type | Developer / app setup | Secrets we'll hold | Photos | Video | Restrictions that matter for auto-posting |
| --- | --- | --- | --- | --- | --- | --- |
| **Facebook** | Facebook **Page**, owned by a Meta **Business portfolio** | Meta for Developers app (Business type) linked to the portfolio; Facebook Login for Business; permissions `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. App Review and Business Verification are needed for Advanced Access; standard access works only for people with a role on the app. | App ID, app secret, long-lived **Page access token**, Page ID | Yes (`/{page-id}/photos`) | Yes: videos and **Reels** (`/{page-id}/video_reels`, resumable upload) | Graph API rate limits per Page; links in text are fine. |
| **Instagram** | Instagram **Professional** account (Business or Creator), ideally linked to the Facebook Page | The same Meta app with the Instagram API (Instagram Login: `instagram_business_basic`, `instagram_business_content_publish`; or via the Facebook Page: `instagram_content_publish`); App Review for public use | Instagram user access token (long-lived, refresh roughly every 60 days), IG user ID | Yes, **JPEG only**, from a public URL | Yes, **Reels**: 9:16 MP4 (H.264/AAC); 5–90s is eligible for the Reels tab via the API | **100 API-published posts per 24 hours** (a carousel counts as one). Media must be at a public URL. **No clickable links** in captions: "link in bio". |
| **Threads** | Threads profile (tied to the Instagram account) | The same Meta app with the Threads API; `threads_basic`, `threads_content_publish`; App Review for public use | Threads user access token (long-lived, refreshable), Threads user ID | Yes (public URL) | Yes (MP4). The engine currently marks Threads video as off. | About **250 published posts per 24 hours**; 500-character posts; media is fetched from a public URL. |
| **X** | Standard X account (verified organisation optional) | X Developer Console project and app; OAuth 2.0 (PKCE) user context with `tweet.write`, `users.read`, `media.write`, `offline.access`; or OAuth 1.0a user tokens | Client ID, client secret, refresh token (or consumer key/secret plus access token/secret) | Yes (media upload) | Yes (chunked upload; standard limit about 140s) | **No free tier since Feb 2026: pay-per-use.** Official pricing: a post costs **$0.015**, and a post **with a URL costs $0.20**. Credits are bought in advance. Every Nuvellum X draft includes a link, so automatic X posting is **not zero-cost**. It needs a budget decision, or X stays manual. |
| **TikTok** | TikTok account (Business account recommended for a publisher) | TikTok for Developers app; Login Kit and **Content Posting API**; scopes `video.publish` (Direct Post) or `video.upload` (send to drafts); verify the media domain for `PULL_FROM_URL` | Client key, client secret, user access token plus refresh token (access about 24h, refresh about 1 year) | Yes (photo posts) | Yes | **Unaudited apps can only post `SELF_ONLY` (private) content, for up to 5 users per 24 hours.** Public posting needs TikTok's app **audit**. Per-creator daily cap of around 15 posts. Links aren't clickable. |
| **YouTube** | YouTube **channel** (a Brand Account is recommended so several people can manage it) | Google Cloud project; enable **YouTube Data API v3**; OAuth consent screen (external) with the `youtube.upload` scope (a sensitive scope, so Google verification is needed); OAuth client | OAuth client ID and secret, **refresh token** for the channel | No photo/community posts via the API | Yes, `videos.insert`. A vertical video of 3 minutes or less is treated as a **Short** automatically, and `#Shorts` helps. | **Videos uploaded by an unverified API project (created after July 2020) are locked private** until the project passes Google's compliance audit. Default quota is 10,000 units/day; check the current upload cost in the Cloud console. |
| **LinkedIn** | LinkedIn **Company Page**; the app must be verified by a Page super admin | LinkedIn Developer app associated with the Page. Posting **as the Page** needs the **Community Management API** (`w_organization_social`, `r_organization_social`). That's an application (Development tier, then Standard tier with a screencast) open only to a **registered legal entity**, with a verified business email, legal name, address, website and privacy policy. "Share on LinkedIn" (`w_member_social`) posts only as a person. | Client ID, client secret, member access token (60 days) plus refresh token where granted, organisation URN | Yes (Images API) | Yes (Videos API) | Page posting depends on the Community Management approval above. Without it, only personal-profile posting is possible. |

### Items only Sam can do

1. Create the seven accounts, the Meta Business portfolio and a YouTube Brand Account, with the owners and 2FA.
2. Decide whether Nuvellum has, or will register, the **legal entity** that LinkedIn (and Meta Business Verification) require.
3. Decide the **X budget**: about $0.20 per linked post, or post to X manually.
4. Submit the platform reviews and audits (Meta App Review, TikTok audit, Google OAuth verification and YouTube audit, LinkedIn access), which need screencasts and a public privacy policy page.
5. Provide a public HTTPS location for media, and verify the domain with TikTok.

Sources: [Meta Instagram content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/), [X API pricing](https://docs.x.com/x-api/getting-started/pricing), [TikTok Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines), [YouTube videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [YouTube quota and compliance audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits), [LinkedIn Community Management API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview).
