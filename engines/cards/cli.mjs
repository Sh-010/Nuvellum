#!/usr/bin/env node
import { loadStory } from '../shared/article.mjs';
import { renderSocialCards, SOCIAL_CARD_DIR } from './render.mjs';

const argv = process.argv.slice(2);
const i = argv.indexOf('--slug');
const slug = i >= 0 ? argv[i + 1] : null;
if (!slug) {
  console.error('Usage: node cards/cli.mjs --slug <published-article-slug>');
  process.exit(1);
}

const story = loadStory(slug);
const manifest = renderSocialCards(story, SOCIAL_CARD_DIR);
console.log(JSON.stringify(manifest, null, 2));

