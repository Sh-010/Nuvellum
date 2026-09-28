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
    const story = loadStory('diablo-cody-reteaming-with-nathan-kahane-and-mason-novick-on-next-film-always-roxanne');
    const m = renderSocialCards(story, dir);
    const square = readFileSync(join(dir, story.slug, 'square.svg'), 'utf8');
    assert.equal(m.sourceMode, 'illustration');
    assert.match(square, /<image href="data:image\/svg\+xml;base64,/);
    assert.match(square, /ILLUSTRATION/);
    assert.match(square, /ALWAYS|Always|Diablo/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

