# Automated Visual Acquisition

Nuvellum performs a conservative visual-acquisition pass on every `incoming/**` newsroom story before the publication gate can merge it.

## Order of preference

1. Existing real visual already supplied to the article — leave it alone.
2. For photo-class news/culture/sports stories, search Wikimedia Commons for an openly licensed documentary/editorial photograph.
3. Automatically accept a photo only when deterministic relevance and composition thresholds are high enough.
4. If no candidate clears the threshold for an ordinary **News** story, remove any newsroom-generated fallback art and publish it intentionally **text-led**. A weak illustration is not used merely to fill the image slot.
5. Opinion/essay/ideas pieces may remain illustration-first. Analysis and genuinely abstract explanatory pieces may keep a story-specific illustration after the real-photo pass, but only if it cleared the existing illustration safety/style gate. House plates and generated SVGs never count as an existing real visual. Geography-sensitive map stories are never auto-replaced with a map.

A wrong documentary image is worse than a clearly editorial illustration, so the automatic threshold is intentionally conservative and stricter for sensitive stories.

## Licensing

Automatic photo acquisition accepts only public-domain, CC0, CC BY and CC BY-SA licences. NC/ND/unclear licences are rejected. The article carries its own image metadata:

- `imageProvider`
- `imageKind`
- `imageCaption`
- `imageCredit`
- `imageLicense`
- `imageLicenseUrl`
- `imageSourcePage`

Automated Commons captions always begin with **File photo:** so an older/context image is not presented as evidence from the event in the story.

## Release contract

`.github/workflows/visual-acquire.yml` runs on every push to `incoming/**`. It may commit the licensed photo and update article frontmatter. That second push re-runs the normal repository checks.

`Acquire editorial visual` is a required publication-gate check on the exact PR head SHA. This prevents an article from being merged while the visual pass is still changing the branch.

If Commons is unavailable or returns no sufficiently relevant image, **News** stories become text-led when their only visual is generated/house fallback art. Illustration-first opinion/essay/ideas pieces and eligible abstract analysis may retain a safe, story-specific illustration.

## Local inspection

```bash
npm run visual:acquire -- src/content/articles/<slug>.md
npm run visual:acquire -- --apply src/content/articles/<slug>.md
```

The first command reports a selection. `--apply` downloads the selected image, writes licensing metadata and removes the unused newsroom AI SVG for that slug.
