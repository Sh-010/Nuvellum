import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The Vercel Ignored Build Step keeps workflow/docs/engine/n8n-only commits from spending the Hobby
// deployment budget (100 a day). Anything the site build reads must never be on the ignore list.
const script = readFileSync('scripts/vercel-ignore-build.sh', 'utf8');
const pattern = new RegExp(script.match(/grep -Ev '([^']+)'/)[1]);

test('non-production paths are ignored', () => {
  for (const p of ['.github/workflows/x.yml', 'docs/A.md', 'tests/a.test.mjs', 'engines/shorts/a.mjs', 'ops/req.txt', 'n8n/workflows/nuvellum-newsroom.json', 'WORKLOG.md', 'README.md']) assert.ok(pattern.test(p), p);
});

test('anything the site build reads always deploys', () => {
  for (const p of ['src/content/articles/a.md', 'src/pages/index.astro', 'public/uploads/articles/a.jpg', 'scripts/render-editorial-home.mjs', 'api/brief.js', 'vercel.json', 'package.json', 'astro.config.mjs', 'docs.md']) assert.ok(!pattern.test(p), p);
});
