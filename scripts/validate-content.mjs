import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { articleErrors, validateSvg } from './lib/article-rules.mjs';

// The article contract itself lives in scripts/lib/article-rules.mjs, shared with the admin dashboard.
const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const dir = join(root, 'src', 'content', 'articles');
const aiArtDir = join(root, 'public', 'generated', 'ai');

const errors = [];
const ctx = {
  registry: { titles: new Map(), sources: new Map() },
  aiArtExists: (slug) => existsSync(join(aiArtDir, `${slug}.svg`)),
  publicFileExists: (path) => existsSync(join(root, 'public', path))
};

for (const name of readdirSync(dir).filter(x => x.endsWith('.md')).sort()) {
  errors.push(...articleErrors(readFileSync(join(dir, name), 'utf8'), name, ctx));
}

// Every committed AI illustration is untrusted input served from our origin.
if (existsSync(aiArtDir)) {
  for (const file of readdirSync(aiArtDir).sort()) {
    if (file.startsWith('.')) continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/.test(file)) {
      errors.push(`public/generated/ai/${file}: only <slug>.svg files are allowed here`);
      continue;
    }
    for (const problem of validateSvg(readFileSync(join(aiArtDir, file), 'utf8'), `public/generated/ai/${file}`)) errors.push(problem);
  }
}

if (errors.length) {
  console.error('\nNuvellum content validation failed:\n');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Nuvellum content validation passed.');
