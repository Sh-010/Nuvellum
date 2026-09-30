// Media-kit facts that can be verified from the repository itself: output, cadence, sections, formats and
// image licensing. Audience numbers are deliberately absent: they must come from GA4 and the Brief admin once
// those are live, never be estimated. Usage: npm run media-kit [-- --json]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { articlesDir } from './lib/paths.mjs';
import { parseFrontmatter } from './lib/editorial.mjs';

export function mediaKitFacts(entries, now = Date.now()) {
  const pub = entries.filter((e) => e.data.status === 'published');
  const day = (e) => Date.parse(e.data.publishedAt || e.data.date || '') || 0;
  const within = (d) => pub.filter((e) => now - day(e) <= d * 864e5).length;
  const count = (key) => Object.fromEntries(Object.entries(pub.reduce((m, e) => ((m[e.data[key] || 'unlabelled'] = (m[e.data[key] || 'unlabelled'] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]));
  const words = pub.map((e) => e.body.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b);
  const image = (e) => { const i = String(e.data.image || ''); return !i ? 'text-led' : e.data.imageKind === 'photo' || /\.(jpe?g|png|webp)$/i.test(i) ? 'licensed photo' : 'illustration'; };
  const dates = pub.map(day).filter(Boolean).sort((a, b) => a - b);
  return {
    generatedAt: new Date(now).toISOString(),
    publishedStories: pub.length,
    firstPublished: dates.length ? new Date(dates[0]).toISOString().slice(0, 10) : null,
    publishedLast7Days: within(7),
    publishedLast30Days: within(30),
    sections: count('section'),
    formats: count('type'),
    medianWords: words.length ? words[words.length >> 1] : 0,
    visuals: pub.reduce((m, e) => ((m[image(e)] = (m[image(e)] || 0) + 1), m), {}),
    audience: 'not yet measured: take page views and users from GA4 and Brief subscribers from /admin once live; never estimate'
  };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || import.meta.url === `file://${process.argv[1]}`) {
  const entries = readdirSync(articlesDir).filter((f) => f.endsWith('.md')).map((f) => {
    const src = readFileSync(join(articlesDir, f), 'utf8');
    return { data: parseFrontmatter(src) || {}, body: src.slice(src.indexOf('\n---', 3) + 4) };
  });
  const facts = mediaKitFacts(entries);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(facts, null, 2)); process.exit(0); }
  console.log(`Nuvellum publication facts (${facts.generatedAt.slice(0, 10)}; from the repository)`);
  console.log(`- ${facts.publishedStories} published stories since ${facts.firstPublished}; ${facts.publishedLast7Days} in the last 7 days, ${facts.publishedLast30Days} in the last 30`);
  console.log(`- Median length ${facts.medianWords} words`);
  console.log(`- Sections: ${Object.entries(facts.sections).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`- Formats: ${Object.entries(facts.formats).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`- Visuals: ${Object.entries(facts.visuals).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`- Audience: ${facts.audience}`);
}
