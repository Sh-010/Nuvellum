import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRelatedStories } from '../src/lib/related-stories.js';

const story = (slug, title, section, tags=[]) => ({ slug, title, section, tags, status:'published' });

test('shared franchise outranks newer unrelated same-desk stories', () => {
  const current = story('fire-emblem-detail', 'Fire Emblem Fortune’s Weave connects to Three Houses', 'Gaming', ['Fire Emblem','Nintendo','Gaming']);
  const candidates = [
    story('new-racing-game', 'New racing game gets an update', 'Gaming', ['Gaming']),
    story('older-fire-emblem', 'Fire Emblem: Fortune’s Weave lore explained', 'Gaming', ['Fire Emblem','Gaming']),
    story('animated-film', 'Animated feature premiere', 'Film & TV', ['Film & TV'])
  ];
  assert.deepEqual(selectRelatedStories(current, candidates, 2).map(a=>a.slug), ['older-fire-emblem', 'new-racing-game']);
});

test('a specific shared topic outranks only sharing a desk', () => {
  const current = story('avatar-episode', 'Avatar: Seven Havens episode six', 'Film & TV', ['Avatar Seven Havens','Animation']);
  const candidates = [
    story('movie', 'Unrelated studio film premieres', 'Film & TV', ['Film & TV']),
    story('avatar', 'Avatar Seven Havens franchise analysis', 'Culture', ['Avatar Seven Havens'])
  ];
  assert.equal(selectRelatedStories(current, candidates, 1)[0].slug, 'avatar');
});

test('without topical overlap, preserve newer same-section ordering and do not return current story', () => {
  const current=story('focus', 'A report on global tariffs', 'Business', ['Trade']);
  const candidates=[
    story('unrelated', 'New music releases this week', 'Culture', []),
    story('focus', 'Duplicated current story', 'Business', []),
    story('business-new', 'Quarterly results released', 'Business', []),
    story('business-old', 'Energy prices move', 'Business', [])
  ];
  assert.deepEqual(selectRelatedStories(current, candidates, 3).map(a=>a.slug), ['business-new','business-old','unrelated']);
  assert.deepEqual(selectRelatedStories(current, candidates, 0), []);
});

test('recommendation selector is deterministic and does not mutate articles', () => {
  const current=story('a', 'A new tech platform', 'Technology', null);
  const items=[story('b', 'Another technology story', 'Technology', null),story('c','New film', 'Film & TV', null)];
  const snapshot=JSON.stringify(items);
  assert.deepEqual(selectRelatedStories(current, items),selectRelatedStories(current,items));
  assert.equal(JSON.stringify(items),snapshot);
});
