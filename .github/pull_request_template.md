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
- [ ] Political/electoral coverage is neutral and descriptive.
- [ ] Allegations and contested claims are attributed.
- [ ] Automated: `verification: "cleared"` and `reviewedBy: "Nuvellum Verification Pipeline"`, written by the verification pass (see `docs/EDITORIAL_PIPELINE.md`). Manual: `reviewedBy` names the reviewing editor.
- [ ] A failed or uncertain verification stays `status: "review"`.

### Production
- [ ] Content validation passes (including the AI SVG safety check).
- [ ] Unit tests pass (`npm test`).
- [ ] Build passes.
- [ ] Security checks pass.
- [ ] The approved v5.1 homepage design is unchanged unless this PR explicitly has visual approval.
