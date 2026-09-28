# Automated Visual Acquisition

Nuvellum performs a conservative visual-acquisition pass on every `incoming/**` newsroom story before the publication gate can merge it.

## Order of preference

1. Existing real visual already supplied to the article — leave it alone.
2. For photo-class news/culture/sports stories, search Wikimedia Commons for an openly licensed documentary/editorial photograph.
3. Automatically accept a photo only when deterministic relevance and composition thresholds are high enough.
4. If no candidate clears the threshold, keep the newsroom's fallback: the Nuvellum house plate (`/uploads/house/<section>.svg`), or a generated SVG that passed the style gate.
5. Only opinion/essay/ideas pieces keep illustration by design. Abstract news and analysis try a real photo first. House plates and generated SVGs never count as an existing real visual. Geography-sensitive map stories are never auto-replaced with a map.

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

If Commons is unavailable, returns no sufficiently relevant image, or the story belongs to an illustration-first class, the workflow succeeds without changing the story; the existing safe illustration remains the fallback.

## Local inspection

```bash
npm run visual:acquire -- src/content/articles/<slug>.md
npm run visual:acquire -- --apply src/content/articles/<slug>.md
```

The first command reports a selection. `--apply` downloads the selected image, writes licensing metadata and removes the unused newsroom AI SVG for that slug.
