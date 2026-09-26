# Drafting prompt notes (model A)

Version: 2026-09-26.

- Write an original news article from the SOURCE TEXT only. No outside facts, no invented quotes, no speculation.
- Headline and dek in **sentence case**, no longer than 140 characters for the headline.
- Length follows the source. A short source makes a short article. **Never pad.** If the source text is under ~150 words of substance, return `{"skip": "thin source"}`.
- One story only. If the source is a live blog, round-up, video or gallery page, return `{"skip": "aggregate source"}`.
- Attribute claims ("the ministry said"). Keep material caveats and responses from the source.
- Output JSON with `title`, `dek`, `section`, `type`, `tags`, `bodyMarkdown`. Build the final file with `buildArticle` (snippet `build-article.js`), never by hand.
