import test from 'node:test';
import assert from 'node:assert/strict';
import { storyImage, hasStoryImage } from '../src/lib/story-image.js';

test('only images that depict the story count; generic art means the story is set text-led', () => {
  for (const image of ['/uploads/articles/story.jpg', '/uploads/articles/too-much-information.svg', '/generated/ai/story.svg', 'https://example.org/p.jpg'])
    assert.equal(storyImage({ image }), image);
  for (const image of ['', '  ', undefined, '/images/world.svg', '/images/film.svg', '/uploads/house/gaming.svg', '/generated/some-story.svg'])
    assert.equal(hasStoryImage({ image }), false, String(image));
});
