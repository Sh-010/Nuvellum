## Nuvellum editorial review

### Source and accuracy
- [ ] Source URL(s) open and support the key factual claims.
- [ ] Headline and dek do not overstate the source.
- [ ] Quotes, figures, names and dates were checked.
- [ ] The article is original wording, not a close rewrite of the source.

### Classification
- [ ] Section and article type are correct.
- [ ] `risk` classification is correct.
- [ ] News, analysis, opinion and review are clearly separated.

### Sensitive stories
If `risk: "sensitive"`:
- [ ] Automated stories: `verification: "cleared"` and `reviewedBy: "Nuvellum Verification Pipeline"` (set only by the second-pass verifier).
- [ ] Manual stories: `reviewedBy` names the editor who reviewed the full source material.
- [ ] Political/electoral coverage is neutral and descriptive.
- [ ] Allegations and contested claims are attributed.

### Automated metadata
- [ ] `editorialReview: "passed"` and a `publishedAt` timestamp on the article date.
- [ ] `sourceUrls` is the canonical source (no tracking parameters) and `sourceNote` names the real outlet.
- [ ] The AI illustration (if any) is `public/generated/ai/<slug>.svg` and passes validation.

### Production
- [ ] Content validation passes.
- [ ] Build passes.
- [ ] Security checks pass.
- [ ] The approved v5.1 homepage design is unchanged unless this PR explicitly has visual approval.
