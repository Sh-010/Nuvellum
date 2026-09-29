import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { selectHome, loadPublished, byNewest } from '../scripts/lib/home-selection.mjs';
import { storyImage } from '../src/lib/story-image.js';

let n = 0;
const story = (over) => ({ slug: `s${++n}`, title: `Story ${n}`, dek: 'Dek', section: 'World', type: 'News', status: 'published',
  date: '2026-09-20', publishedAt: '2026-09-20T09:00:00Z', origin: 'automation', ...over });
const slugs = (list) => list.map((a) => a.slug);

test('a newer manual World story becomes the hero', () => {
  const auto = story({ slug: 'auto-world', date: '2026-09-28', publishedAt: '2026-09-28T08:00:00Z' });
  const manual = story({ slug: 'manual-world', origin: 'manual', date: '2026-09-29', publishedAt: '2026-09-29T07:00:00Z' });
  assert.equal(selectHome([auto, manual]).hero.slug, 'manual-world');
  // Same day: the later publish time wins, whatever the origin.
  const early = story({ slug: 'manual-early', origin: 'manual', date: '2026-09-29', publishedAt: '2026-09-29T06:00:00Z' });
  const late = story({ slug: 'auto-late', date: '2026-09-29', publishedAt: '2026-09-29T10:00:00Z' });
  assert.equal(selectHome([early, late]).hero.slug, 'auto-late');
});

test('a published manual story takes part in Latest', () => {
  const list = [
    story({ slug: 'w1', date: '2026-09-29' }),
    story({ slug: 'b1', section: 'Business', date: '2026-09-29' }),
    story({ slug: 't1', section: 'Technology', date: '2026-09-29' }),
    story({ slug: 'c1', section: 'Culture', date: '2026-09-28' }),
    story({ slug: 'manual-culture', origin: 'manual', section: 'Culture', type: 'Essay', date: '2026-09-27' }),
    story({ slug: 'w2', date: '2026-09-26' })
  ];
  const home = selectHome(list);
  const all = slugs(home.latestFilters.find((f) => f.key === 'all').items);
  assert.ok(all.includes('manual-culture'), `Latest/All: ${all}`);
  assert.ok(slugs(home.latestFilters.find((f) => f.key === 'culture').items).includes('manual-culture'));
});

test('the newest manual story is placed at the top when it is not World (under the hero), never dropped', () => {
  const list = [
    story({ slug: 'auto-world', date: '2026-09-28' }),
    story({ slug: 'manual-science', origin: 'manual', section: 'Science', type: 'Essay', date: '2026-09-29' }),
    story({ slug: 'auto-film', section: 'Film & TV', date: '2026-09-28' })
  ];
  const home = selectHome(list);
  assert.equal(home.hero.slug, 'auto-world', 'the hero is the newest World story');
  assert.equal(home.supporting[0].slug, 'manual-science', 'the newest story overall leads the row under the hero');
  assert.ok(!slugs(home.latestFilters[0].items).includes('manual-science'), 'and is not repeated in Latest');
});

test('manual and automated stories coexist, ordered only by date', () => {
  const list = [
    story({ slug: 'a-w', date: '2026-09-25' }),
    story({ slug: 'm-w', origin: 'manual', date: '2026-09-24' }),
    story({ slug: 'a-b', section: 'Business', date: '2026-09-23' }),
    story({ slug: 'm-t', origin: 'manual', section: 'Technology', date: '2026-09-22' }),
    story({ slug: 'a-c', section: 'Culture', date: '2026-09-21' }),
    story({ slug: 'm-w2', origin: 'manual', date: '2026-09-20' }),
    story({ slug: 'a-w2', date: '2026-09-19' })
  ];
  const home = selectHome(list);
  assert.equal(home.hero.slug, 'a-w');
  assert.deepEqual(slugs(home.supporting), ['a-b', 'm-t', 'a-c']);
  assert.deepEqual(slugs(home.latestFilters[0].items), ['m-w', 'm-w2', 'a-w2']);
  assert.deepEqual(slugs(home.latestFilters.find((f) => f.key === 'world').items), ['m-w', 'm-w2', 'a-w2']);
  const origins = new Set([home.hero, ...home.supporting, ...home.latestFilters[0].items].map((a) => a.origin));
  assert.deepEqual([...origins].sort(), ['automation', 'manual']);
});

test('placement ignores origin entirely: relabelling every story gives the same homepage', () => {
  const list = [
    story({ slug: 'x1', date: '2026-09-29' }), story({ slug: 'x2', section: 'Gaming', date: '2026-09-28' }),
    story({ slug: 'x3', section: 'Opinion', type: 'Opinion', date: '2026-09-27' }), story({ slug: 'x4', section: 'Business', type: 'Analysis', date: '2026-09-26' }),
    story({ slug: 'x5', date: '2026-09-25', type: 'Analysis' }), story({ slug: 'x6', section: 'Anime', date: '2026-09-24' })
  ];
  const shape = (h) => JSON.stringify({ hero: h.hero.slug, sup: slugs(h.supporting), latest: h.latestFilters.map((f) => slugs(f.items)), focus: slugs(h.focusStories) });
  const asAuto = shape(selectHome(list));
  const asManual = shape(selectHome(list.map((a) => ({ ...a, origin: 'manual' }))));
  const mixed = shape(selectHome(list.map((a, i) => ({ ...a, origin: i % 2 ? 'manual' : 'automation' }))));
  assert.equal(asManual, asAuto); assert.equal(mixed, asAuto);
});

test('automated-only selection is unchanged (hero, row, Latest, In Focus)', () => {
  const list = [
    story({ slug: 'w-news', date: '2026-09-29' }),
    story({ slug: 'w-analysis', type: 'Analysis', date: '2026-09-28' }),
    story({ slug: 'tech', section: 'Technology', date: '2026-09-28' }),
    story({ slug: 'film', section: 'Film & TV', date: '2026-09-27' }),
    story({ slug: 'biz', section: 'Business', type: 'Explainer', date: '2026-09-26' }),
    story({ slug: 'w-old', date: '2026-09-25' })
  ];
  const home = selectHome(list);
  assert.equal(home.hero.slug, 'w-news');
  assert.deepEqual(slugs(home.supporting), ['tech', 'film', 'biz']);
  assert.deepEqual(slugs(home.latestFilters[0].items), ['w-analysis', 'w-old']);
  // In Focus uses stories not already on top first (w-analysis, w-old), then the newest top story to fill the block.
  assert.deepEqual(slugs(home.focusStories), ['w-analysis', 'w-old', 'tech']);
  const noWorld = selectHome([story({ slug: 'g', section: 'Gaming', date: '2026-09-29' }), story({ slug: 'c', section: 'Culture', date: '2026-09-28' })]);
  assert.equal(noWorld.hero.slug, 'g', 'without a World story the newest story leads');
});

test('In Focus never repeats the hero or the supporting row while other stories are available', () => {
  const list = [
    story({ slug: 'w1', date: '2026-09-30' }), story({ slug: 'tech', section: 'Technology', date: '2026-09-30' }),
    story({ slug: 'film', section: 'Film & TV', date: '2026-09-29' }), story({ slug: 'biz', section: 'Business', type: 'Analysis', date: '2026-09-29' }),
    story({ slug: 'w2', date: '2026-09-28' }), story({ slug: 'sport', section: 'Sports', date: '2026-09-27' }), story({ slug: 'w3', date: '2026-09-26' })
  ];
  const home = selectHome(list);
  const top = new Set([home.hero.slug, ...slugs(home.supporting)]);
  assert.equal(home.focusStories.length, 3);
  assert.ok(home.focusStories.every((a) => !top.has(a.slug)), `In Focus repeats a top story: ${slugs(home.focusStories)}`);
  assert.equal(home.focusStories[0].slug, 'w2', 'the lead In Focus story is the newest World story not already on top');
});

test('drafts and review stories never reach the homepage; nothing is invented to fill space', () => {
  const home = selectHome([story({ slug: 'pub' }), story({ slug: 'draft', status: 'draft', date: '2026-09-30' }), story({ slug: 'rev', status: 'review', date: '2026-09-30' })]);
  assert.equal(home.hero.slug, 'pub');
  assert.equal(home.supporting.length, 0);
  assert.ok(home.latestFilters.every((f) => f.items.length === 0), 'empty Latest sets stay empty (the renderer shows its note), never padded');
  assert.throws(() => selectHome([]), /at least one published story/);
});

test('the repository homepage: the real manual story is placed, and every origin can lead', () => {
  const published = loadPublished(fileURLToPath(new URL('../src/content/articles/', import.meta.url)));
  const home = selectHome(published);
  assert.deepEqual(slugs(home.articles), slugs([...published].sort(byNewest)));
  // Whatever is published right now (stories can be unpublished from the desk), the newest story of each origin
  // is placed; the fixture tests above prove this for manual stories specifically.
  const onPage = new Set([home.hero.slug, ...slugs(home.supporting), ...home.latestFilters.flatMap((f) => slugs(f.items))]);
  for (const origin of new Set(published.slice(0, 4).map((a) => a.origin))) {
    const newest = published.find((a) => a.origin === origin);
    assert.ok(onPage.has(newest.slug), `${newest.slug} (${origin}) is on the homepage`);
  }
  const world = published.filter((a) => a.section === 'World');
  assert.equal(home.hero.slug, world[0].slug, 'hero = newest World story');
});

test('images: manual stories show only their own image; text-led ones produce no image at all', () => {
  assert.equal(storyImage({ origin: 'manual', image: '/uploads/articles/m.jpg' }), '/uploads/articles/m.jpg');
  assert.equal(storyImage({ origin: 'manual', image: 'https://upload.wikimedia.org/x.jpg' }), 'https://upload.wikimedia.org/x.jpg');
  assert.equal(storyImage({ origin: 'manual' }), '', 'no image recorded -> text-led, no generated art');
  assert.equal(storyImage({ origin: 'manual', image: '   ' }), '');
  assert.equal(storyImage({ origin: 'manual', image: '/generated/some-slug.svg' }), '', 'procedural art never stands in for a manual story');
  assert.equal(storyImage({ origin: 'automation', image: '/generated/ai/x.svg' }), '/generated/ai/x.svg', 'approved AI illustration still shows for automated stories');
});

test('renderer and legacy injector both place every origin, and never emit an image without a source', () => {
  const renderer = readFileSync(new URL('../scripts/render-editorial-home.mjs', import.meta.url), 'utf8');
  assert.match(renderer, /selectHome\(loadPublished\(articlesDir\)\)/);
  assert.doesNotMatch(renderer, /origin\s*===\s*'automation'/);
  const injector = readFileSync(new URL('../scripts/inject-home-content.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(injector, /\.filter\(a => a\.origin === 'automation'\)/, 'no origin filter on homepage stories');
  assert.match(injector, /if \(a\.origin !== 'automation'\) return storyImage\(a\);/, 'manual images: own image or none');
  assert.equal(injector.split('<img ').length - 1, 1, 'one shared image tag (imgTag), used only when art(a) is set');
  assert.match(injector, /art\(a\) \? `<a class="media"/, 'image slots render only when there is an image');
  assert.match(injector, /return a \? leadMarkup\(hero\)|a \? sideMarkup\(a, i === 1\) : original/, 'demo slots are kept only where no real story fills them');
  const check = readFileSync(new URL('../scripts/check-build-output.mjs', import.meta.url), 'utf8');
  assert.match(check, /an image has an empty or undefined src/);
});
