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
