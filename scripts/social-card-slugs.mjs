// Prints, one per line, the slugs the social-card workflow should render (see cardSlugs()).
//   REQUESTED   slugs from the dispatch input or ops/social-card-request.txt (space/comma/newline separated)
//   HAVE_CARDS  file listing the social-assets tree (git ls-tree -r --name-only), optional
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './lib/editorial.mjs';
import { articlesDir } from './lib/paths.mjs';
import { cardSlugs } from './lib/publication-chain.mjs';

const requested = String(process.env.REQUESTED || '').split(/[\s,]+/).filter(Boolean);
const tree = process.env.HAVE_CARDS && existsSync(process.env.HAVE_CARDS) ? readFileSync(process.env.HAVE_CARDS, 'utf8') : '';
const haveCards = new Set([...tree.matchAll(/^cards\/([a-z0-9-]+)\/manifest\.json$/gm)].map((m) => m[1]));
const articles = readdirSync(articlesDir).filter((n) => n.endsWith('.md')).map((n) => ({
  slug: n.slice(0, -3),
  data: parseFrontmatter(readFileSync(join(articlesDir, n), 'utf8')) || {}
}));
for (const slug of cardSlugs({ requested, articles, haveCards })) console.log(slug);
