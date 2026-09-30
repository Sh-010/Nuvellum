# Automated Visual Acquisition

Nuvellum performs a conservative visual-acquisition pass on every `incoming/**` newsroom story before the publication gate can merge it.

## Order of preference

1. Existing real visual already supplied to the article — leave it alone.
2. For photo-class news/culture/sports stories, search Wikimedia Commons for an openly licensed documentary/editorial photograph.
3. Automatically accept a photo only when deterministic relevance and composition thresholds are high enough, and only if it is contemporaneous and of this occasion: a file dated more than a year before the story, or of a different ceremony/meeting/visit/award, is not the story's own picture.
3a. Otherwise, a **representative** image of the story's primary subject (`scripts/visual/representative.mjs`) — see below.
4. If neither tier finds a qualifying image for an ordinary **News** story, remove any newsroom-generated fallback art and publish it intentionally **text-led**. A weak illustration is not used merely to fill the image slot.
5. Opinion/essay/ideas pieces may remain illustration-first. Analysis and genuinely abstract explanatory pieces may keep a story-specific illustration after the real-photo pass, but only if it cleared the existing illustration safety/style gate. House plates and generated SVGs never count as an existing real visual. Geography-sensitive map stories are never auto-replaced with a map.

A wrong documentary image is worse than a clearly editorial illustration, so the automatic threshold is intentionally conservative and stricter for sensitive stories.

## Representative images

When the story has no photograph of its own, the subject usually does. The representative tier:

1. Takes the subject from the article tags in headline order (a surname in the headline counts), skipping generic tags.
2. Resolves it on Wikidata to an exact label/alias match of a whitelisted class — person, organisation, institution/university, event, place, or a work credited to someone in the story. Abstract concepts are never subjects; homonyms (the plant genus *Nasa*, a single called *Netflix*, a different book called *Icebreaker*) are rejected by class and by overlap with the story text.
3. Collects Commons files that are the entity's canonical image (P18), depict it (P180), sit in its category, or (events) carry its name.
4. Filters them:
   - the unchanged licence/size/host checks (`visualCandidateProblems`);
   - the file must name the subject;
   - no police, crime, war, protest or disaster scenes;
   - **people**: shown on their own, with no occasion (visits, rallies, signings, church or summit photo-ops), no meeting or interview, and no second person;
   - **non-people**: not a photograph of a person;
   - **legal/sensitive stories**: never a person, and for institutions only buildings, grounds or views (no rooms, crowds or ceremonies).
5. Prefers:
   - official portraits for people;
   - buildings and headquarters over logos for organisations;
   - signage and venue views for events;
   - campus and building views for institutions.

   A minimum score still applies, so a weak match stays text-led.

| Subject | Preferred representative image | `fallbackType` |
|---|---|---|
| Person | Official or solo portrait | `representative-person` |
| Organisation | Headquarters / official building, else logo | `representative-organisation` |
| Institution / university | Campus building or view (seal only if nothing else) | `representative-institution` |
| Event | Official signage, banners, venue | `representative-event` |
| Place | View of the place | `representative-place` |

The caption says what the picture is and that it is not the story: *File photo: … Image of <subject>, not of the events reported.* A Commons description that refers to an unnamed "he/she" is replaced by the file title, so it cannot read as the person in our story. Credit, licence, licence URL and source page are written exactly as for a story photo.

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
