# Nuvellum source matrix

Nuvellum's automated intake is deliberately multi-source. No single publisher should dominate the candidate queue.

## Active RSS intake

| Desk | Sources |
| --- | --- |
| World | BBC World, Al Jazeera, France 24, Deutsche Welle |
| Business | BBC Business, CNBC, Fortune |
| Technology | BBC Technology, TechCrunch, The Verge, Ars Technica |
| Science | BBC Science & Environment, NASA, ScienceDaily |
| Crime | FBI National Press Releases, The Guardian US Crime |
| Sports | BBC Sport, ESPN |
| Culture | BBC Culture, The Guardian Culture |
| Film & TV | The Guardian Film, Variety, Deadline |
| Anime | Anime News Network |
| Gaming | IGN, Polygon, GamesIndustry.biz |

Opinion & Ideas remains human-led rather than automatically derived from third-party opinion columns. Automated reporting can supply facts and background for future commissioned analysis, but Nuvellum should not mechanically rewrite another outlet's opinion into its own voice.

## Diversity controls

The automated queue:
- normalizes source URLs before deduplication;
- ignores video/liveblog/podcast URLs in the normal article queue;
- prefers three candidates from different domains and different section hints;
- falls back to unique domains if three different sections are not available;
- compares new candidates against both published Nuvellum titles and open editorial PR titles;
- treats the same event from another outlet as a duplicate unless it contains a materially new development.

## Section routing

Strong source hints are enforced where a publisher is desk-specific:
- TechCrunch / The Verge / Ars Technica -> Technology
- NASA / ScienceDaily -> Science
- FBI -> Crime
- CNBC / Fortune -> Business
- ESPN / BBC Sport -> Sports
- Variety / Deadline / Guardian Film -> Film & TV
- Anime News Network -> Anime
- IGN / Polygon / GamesIndustry.biz -> Gaming

The draft model may still classify general international feeds by the actual story content.

## Editorial risk

Routine mentions of governments, grants, public services, regulators, charities or agencies do not by themselves make a story sensitive.

Sensitive review is required for:
- politics and elections;
- political-officeholder actions in a political or public-policy context;
- armed conflict and serious violence;
- crime accusations and ongoing prosecutions;
- deaths or serious harm;
- sensitive personal information;
- security/privacy breaches;
- lawsuits and serious legal or reputational allegations.

All Crime stories remain sensitive by default. Sensitive stories are published only after they clear the automated second-pass verification (see docs/EDITORIAL_PIPELINE.md).

## Source policy

RSS inclusion is a discovery mechanism, not an endorsement of every claim published by a source. Nuvellum articles must remain original, attribute contested claims, and preserve uncertainty. For sensitive stories, editors should use additional reporting or primary sources when available before publication.

## Observed source quality (production runs, 2026-09-26/27)

Evidence from the live v6.5 end-to-end runs (executions 897–909). Use it when adding or dropping feeds.

| Source | Observed | Handling |
|---|---|---|
| BBC News / BBC Sport | Clean JSON-LD or `<article>` text; good attribution. | Keep. `/news/live/` and `/av/` pages are blocked. |
| Al Jazeera, France 24, Deutsche Welle | Clean text. DW publishes live pages as `/live-<id>` and adds `maca=` trackers. | Keep. `/live-<id>` blocked; `maca` stripped. |
| Variety, Deadline | Clean; "columns" are usually event reporting, not opinion. The page includes "Latest" teaser lists. | Keep. The on-topic guard and the draft prompt keep teasers out. |
| TechCrunch | Usually clean; some pages return no extractable text. | Keep; empty pages fail the `Enough Source?` gate. |
| The Verge | Mix of news and newsletter/column pieces ("Installer"). A newsletter was once drafted into a three-story mash-up (run 911). | Keep; the drafter declines roundups/newsletters and review rejects multi-story articles. |
| Polygon | Mix of news and opinion columns ("X is a nightmare", "Y needs to make a comeback"). | Keep; the drafter declines opinion and unattributed normative headlines are rejected. |
| Anime News Network | Page fetch returned no extractable text on every run on 2026-09-27. | Low yield; investigate the extractor or replace the feed. |
| CNBC | Full-page fetch consistently yields only the RSS snippet (16–27 words), plus listicles ("3 dividend stocks"). | Low yield. It never publishes by itself, but it takes a candidate slot. Candidates per run were raised to five. Replace it if a better Business feed is found. |

Selection keeps outlet and desk diversity, takes up to five candidates per run, and publishes only the ones that pass every gate. A run that publishes nothing is acceptable when every rejection is correct.
