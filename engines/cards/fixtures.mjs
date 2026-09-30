// Sample stories for card QA and tests: real published stories, plus synthetic edge cases built on a real
// story's shape. Synthetic entries are marked "fixture-" and never published.
import { loadStory } from '../shared/article.mjs';

const base = () => loadStory('pokemon-tcg-s-next-big-set-available-weeks-before-official-release');
const synth = (slug, over) => ({ ...base(), slug: `fixture-${slug}`, url: `https://www.nuvellum.news/article/fixture-${slug}`, dek: '', sentences: [], ...over });

export const FIXTURES = {
  photo: { story: loadStory('anthropic-releases-sonnet-5-5-highlighting-speed-and-lower-costs') },
  photoWorld: { story: loadStory('us-deportations-are-triggering-a-cascade-of-rights-abuses-un-experts-warn') },
  textLed: { story: base() },
  culture: { story: loadStory('martin-mcdonagh-calls-wild-horse-nine-his-most-political-film') },
  illustration: { story: synth('illustration', { title: 'Too much information, too little interpretation: how readers navigate the feed', section: 'Culture', type: 'News', image: '/uploads/articles/too-much-information.svg', imageKind: 'illustration', mediaMode: 'illustration', imageCredit: null }) },
  opinion: { story: synth('opinion', { title: 'The internet flattened taste. Culture is becoming strange again.', dek: 'A generation raised on recommendation feeds is quietly rebuilding the idea of an acquired taste.', section: 'Opinion', type: 'Opinion', author: 'Fixture Author', image: null, mediaMode: 'text-led' }) },
  analysis: { story: synth('analysis', { title: 'Why Europe’s data centres are becoming a test of digital sovereignty', dek: 'The rush to build AI capacity collides with power grids, water and politics.', section: 'Technology', type: 'Analysis', image: null, mediaMode: 'text-led' }) },
  breaking: { story: { ...loadStory('us-deportations-are-triggering-a-cascade-of-rights-abuses-un-experts-warn'), slug: 'fixture-breaking', live: 'breaking', publishedAt: '2026-09-30T14:20:00Z' } },
  developing: { story: synth('developing', { title: 'Ceasefire talks resume in Doha', dek: 'Negotiators returned after a two-day pause, officials said.', section: 'World', live: 'developing', publishedAt: '2026-09-30T09:05:00Z', image: null, mediaMode: 'text-led' }) },
  short: { story: synth('short', { title: 'Markets steady', dek: '', section: 'Business' }) },
  long: { story: synth('long', { title: 'Regional officials, independent observers and humanitarian agencies warned on Tuesday that the combination of flooding, landslides and damaged supply routes across three provinces could leave hundreds of thousands of residents without reliable access to food, clean water and medical care for several weeks', section: 'World' }) },
  longPhoto: { story: { ...loadStory('anthropic-releases-sonnet-5-5-highlighting-speed-and-lower-costs'), slug: 'fixture-long-photo', title: 'Anthropic releases Sonnet 5.5, highlighting speed, lower costs and a new generation of agent tools that developers say could reshape how software teams build, test and ship products across the industry' } },
  unsafe: { story: synth('unsafe', { title: '<script>alert("x")</script> & “quotes” \'apostrophes\' <b>bold</b> \u0007bell', dek: 'Dek with <tags> & ampersands', section: 'World & <Region>', author: '<img src=x onerror=alert(1)>' }) },
  minimal: { story: synth('minimal', { title: 'A story with only a headline', dek: '', section: '', type: '', author: '', tags: [], image: null, mediaMode: 'text-led', publishedAt: null }) },
  accents: { story: synth('accents', { title: 'Zürich, Kraków and São Paulo weigh Łódź-style rail deals as Škoda bids', section: 'Business' }) }
};
