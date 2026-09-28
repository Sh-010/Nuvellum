# Drafting prompt notes (model A)

Version: 2026-09-26.

- Write an original news article from the SOURCE TEXT only. No outside facts, no invented quotes, no speculation.
- Headline and dek in **sentence case**, no longer than 140 characters for the headline.
- Length follows the source. A short source makes a short article. **Never pad.** If the source text is under ~150 words of substance, return `{"skip": "thin source"}`.
- One story only. If the source is a live blog, round-up, video or gallery page, return `{"skip": "aggregate source"}`.
- Attribute claims ("the ministry said"). Keep material caveats and responses from the source.
- Output JSON with `title`, `dek`, `section`, `type`, `tags`, `regions`, `countries`, `bodyMarkdown`.
- `regions` is always an array using only these canonical slugs: `north-america`, `latin-america-caribbean`, `europe-central-asia`, `middle-east-north-africa`, `sub-saharan-africa`, `south-asia`, `east-asia`, `southeast-asia-oceania`. Use `[]` when no World Desk region is materially part of the story.
- `countries` is always an array of country names explicitly supported by the source. Use `[]` when no country is materially part of the story. Do not infer a country from a company, person's nationality, or an incidental mention. Name countries as Nuvellum’s World Explorer does: United States (not US or USA), United Kingdom, Türkiye, Czechia, Netherlands, Bosnia and Herzegovina, Democratic Republic of the Congo, Palestine (for Gaza or the West Bank). A name the site cannot place holds the story.
- Build the final file with `buildArticle` (snippet `build-article.js`), never by hand.
