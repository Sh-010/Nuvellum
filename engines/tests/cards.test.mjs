import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStory } from '../shared/article.mjs';
import { renderSocialCards } from '../cards/render.mjs';

test('text-led story renders premium square and portrait cards without fake imagery', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nuvellum-cards-'));
  try {
    const story = loadStory('pokemon-tcg-s-next-big-set-available-weeks-before-official-release');
    const m = renderSocialCards(story, dir);
    const square = readFileSync(join(dir, story.slug, 'square.svg'), 'utf8');
    const portrait = readFileSync(join(dir, story.slug, 'portrait.svg'), 'utf8');
    assert.equal(m.sourceMode, 'text-led');
    assert.match(square, /width="1080" height="1080"/);
    assert.match(portrait, /width="1080" height="1350"/);
    assert.match(square, /NUVELLUM/);
    assert.match(square, /Pokémon TCG/);
    assert.ok(!square.includes('<image href='));
    assert.match(square, /#681F2D/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('approved illustration is embedded into the branded card and labelled', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nuvellum-cards-'));
  try {
    // A fixed fixture: which published stories currently carry an approved illustration changes as the
    // Visual Engine swaps art for photos or text-led layouts, so the test must not depend on one.
    const story = { ...loadStory('pokemon-tcg-s-next-big-set-available-weeks-before-official-release'), slug: 'illustration-fixture',
      title: 'Diablo Cody reteams with Always Roxanne producers', image: '/images/world.svg', imageKind: 'illustration', mediaMode: 'illustration' };
    const m = renderSocialCards(story, dir);
    const square = readFileSync(join(dir, story.slug, 'square.svg'), 'utf8');
    assert.equal(m.sourceMode, 'illustration');
    assert.match(square, /<image href="data:image\/svg\+xml;base64,/);
    assert.match(square, /ILLUSTRATION/);
    assert.match(square, /ALWAYS|Always|Diablo/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


// Regressions from the pre-connection QA pass: headlines ran past the card edge (character-count wrapping),
// the last wrapped line kept a single word before the ellipsis, and Nuvellum SVGs were labelled FILE PHOTO.
import { wrap, textWidth } from '../cards/render.mjs';
import { mediaMode } from '../shared/article.mjs';

test('headlines wrap by rendered width and never exceed the 936px text column', () => {
  const titles = [
    "Pokémon TCG's next big set available weeks before official release",
    "Diablo Cody reteaming with Nathan Kahane and Mason Novick on next film 'Always, Roxanne'",
    'WWWWWWWW MMMMMMMM WWWWWWWW MMMMMMMM WWWWWWWW MMMMMMMM'
  ];
  for (const t of titles) for (const size of [54, 58, 68, 76]) {
    for (const line of wrap(t, 936, size, 7)) assert.ok(textWidth(line, size) <= 936, `"${line}" at ${size}px is ${Math.round(textWidth(line, size))}px`);
  }
  // Calibrated against Chrome: this line measured 993px at 54px Georgia Bold.
  assert.equal(Math.round(textWidth('Diablo Cody reteaming with Nathan', 54)), 993);
});

test('a truncated dek fills its last line instead of leaving one word before the ellipsis', () => {
  const dek = 'Writer Diablo Cody is collaborating with producer Nathan Kahane of True North and Mason Novick on her upcoming film project, Always, Roxanne, which follows a woman and her grandmother.';
  const lines = wrap(dek, 936, 22, 1, 'italic');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /…$/);
  assert.ok(lines[0].split(' ').length > 8, lines[0]);
});

test('every distributable story renders both cards inside the margins', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nuvellum-cards-'));
  try {
    const story = loadStory('diablo-cody-reteaming-with-nathan-kahane-and-mason-novick-on-next-film-always-roxanne');
    renderSocialCards(story, dir);
    for (const f of ['square', 'portrait']) {
      const svg = readFileSync(join(dir, story.slug, f + '.svg'), 'utf8');
      for (const m of svg.matchAll(/<text x="72" y="(\d+)"[^>]*font-size="(\d+)"[^>]*>([^<]*)<\/text>/g)) {
        const face = /font-style="italic"/.test(m[0]) ? 'italic' : 'bold';
        if (/Georgia/.test(m[0])) assert.ok(72 + textWidth(m[3].replace(/&apos;/g, "'").replace(/&amp;/g, '&'), +m[2], face) <= 1008, `${f}: "${m[3]}" overflows`);
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Nuvellum-drawn SVGs in /uploads/articles are illustrations, not file photos', () => {
  assert.equal(mediaMode({ image: '/uploads/articles/too-much-information.svg' }), 'illustration');
  assert.equal(mediaMode({ image: '/uploads/articles/some-story.jpg' }), 'photo');
  assert.equal(mediaMode({ image: '/generated/ai/some-story.svg' }), 'illustration');
  assert.equal(mediaMode({}), 'text-led');
});
