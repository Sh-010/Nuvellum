import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../shared/article.mjs';
import { renderSocialCards } from '../cards/render.mjs';
import { FORMATS, LEGIBLE, chooseVariant, pickQuote, stamp } from '../cards/templates.mjs';
import { fitText, balanced, measure } from '../cards/fit.mjs';
import { storyMedia } from '../cards/media.mjs';
import { FIXTURES } from '../cards/fixtures.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'nv-cards-'));
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function render(key, opts) {
  const dir = tmp();
  const job = FIXTURES[key];
  const m = renderSocialCards(job.story, dir, opts || job.options || {});
  const read = (fmt) => readFileSync(join(dir, m.slug, `${fmt}.svg`), 'utf8');
  return { m, dir, read, done: () => rmSync(dir, { recursive: true, force: true }) };
}
/** Every <text> line: position, size, face, content, measured box. */
function textsOf(svg) {
  return [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*data-face="([\w-]+)" data-w="([\d.]+)" data-box="([\d.]+),([\d.]+)">([^<]*)<\/text>/g)].map((m) => {
    const anchor = /text-anchor="(\w+)"/.exec(m[0])?.[1] || 'start';
    const ls = +(/letter-spacing="([\d.]+)"/.exec(m[0])?.[1] || 0);
    const content = unesc(m[8]);
    const w = measure(content, +m[3], m[4], ls);
    const x = +m[1];
    const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    return { x, y: +m[2], size: +m[3], face: m[4], min: +m[6], max: +m[7], left, right: left + w, content, anchor };
  });
}
/** The fitted-text invariants: every line inside its box and the canvas. */
function assertNoOverflow(svg, fmt, label) {
  const { w, h } = FORMATS[fmt] || { w: +/width="(\d+)"/.exec(svg)[1], h: +/height="(\d+)"/.exec(svg)[1] };
  for (const t of textsOf(svg)) {
    if (t.content === '“' || t.content === 'N') continue; // ornaments are placed, not fitted
    assert.ok(t.left >= t.min - 1 && t.right <= t.max + 1, `${label}: "${t.content}" (${t.left.toFixed(0)}–${t.right.toFixed(0)}) outside its box ${t.min}–${t.max}`);
    assert.ok(t.left >= 0 && t.right <= w && t.y - t.size * 0.8 >= 0 && t.y + t.size * 0.25 <= h, `${label}: "${t.content}" leaves the ${w}×${h} canvas`);
  }
}

test('every format renders at its exact size, and quote cards at feed sizes', () => {
  const r = render('photo');
  try {
    const want = { square: [1080, 1080], landscape: [1200, 630], portrait: [1080, 1350], story: [1080, 1920], 'quote-square': [1080, 1080], 'quote-portrait': [1080, 1350] };
    for (const a of r.m.assets) {
      const svg = readFileSync(join(REPO_ROOT, a.path), 'utf8');
      const [W, H] = want[a.format];
      assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"`), a.format);
      assert.deepEqual([a.width, a.height], [W, H]);
    }
    assert.deepEqual(r.m.assets.map((a) => a.format), ['square', 'landscape', 'portrait', 'story', 'quote-square', 'quote-portrait']);
  } finally { r.done(); }
});

test('the manifest is the contract for the publisher (and keeps the v1 keys)', () => {
  const r = render('photo');
  try {
    const m = r.m;
    assert.equal(m.version, 2);
    assert.equal(m.url, FIXTURES.photo.story.url);
    for (const k of ['square', 'portrait', 'landscape', 'story']) assert.ok(existsSync(join(REPO_ROOT, m[k])) || existsSync(m[k]), k);
    assert.equal(m.sourceMode, 'photo');
    assert.equal(m.media.mode, 'photo');
    assert.deepEqual(m.media.usedBy, ['square', 'landscape', 'portrait', 'story']);
    assert.match(m.media.credit, /^Photo: TechCrunch \/ CC BY 2\.0$/);
    assert.equal(m.rasterNeededForLivePosting, true);
    for (const a of m.assets) { assert.ok(a.use && a.safeZone && a.safeZone.width > 0); }
    assert.equal(m.clipped, false);
  } finally { r.done(); }
});

test('raster photo: the story’s own picture, labelled FILE PHOTO with its credit, never under text', () => {
  const r = render('photo');
  try {
    for (const fmt of ['square', 'landscape', 'portrait', 'story']) {
      const svg = r.read(fmt);
      assert.match(svg, /<image href="data:image\/jpeg;base64,/, fmt);
      assert.match(svg, />FILE PHOTO</);
      assert.match(svg, /Photo: TechCrunch \/ CC BY 2\.0|PHOTO: TECHCRUNCH \/ CC BY 2\.0/);
      // Headline lines never sit on the picture (only the label chips do).
      const img = /<image href="[^"]+" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg).slice(1).map(Number);
      for (const t of textsOf(svg).filter((t) => t.face.startsWith('normal-6') && t.size >= 30)) {
        const overlapX = t.left < img[0] + img[2] && t.right > img[0];
        const overlapY = t.y > img[1] && t.y - t.size * 0.8 < img[1] + img[3];
        assert.ok(!(overlapX && overlapY), `${fmt}: "${t.content}" sits on the picture`);
      }
      assertNoOverflow(svg, fmt, `photo/${fmt}`);
    }
  } finally { r.done(); }
});

test('approved illustration: embedded, labelled ILLUSTRATION, no photo credit', () => {
  const r = render('illustration');
  try {
    const svg = r.read('square');
    assert.equal(r.m.media.mode, 'illustration');
    assert.match(svg, /<image href="data:image\/svg\+xml;base64,/);
    assert.match(svg, />ILLUSTRATION</);
    assert.doesNotMatch(svg, /Photo:|FILE PHOTO/);
    assert.equal(r.m.variant, 'culture', 'culture section + picture → image-forward template');
  } finally { r.done(); }
});

test('text-led: no picture is invented, the monogram carries the design', () => {
  const r = render('textLed');
  try {
    for (const fmt of ['square', 'landscape', 'portrait', 'story']) {
      const svg = r.read(fmt);
      assert.doesNotMatch(svg, /<image /, fmt);
      assert.match(svg, />N<\/text>/, 'monogram watermark');
      assertNoOverflow(svg, fmt, `text/${fmt}`);
    }
    assert.equal(r.m.media.mode, 'text-led');
  } finally { r.done(); }
});

test('never a stand-in picture: missing, remote or unknown images mean a text-led card', () => {
  const base = FIXTURES.photo.story;
  for (const image of ['/uploads/articles/does-not-exist.jpg', 'https://example.com/a.jpg', '/uploads/articles/x.gif', null]) {
    assert.equal(storyMedia({ ...base, image }), null, String(image));
  }
  const dir = tmp();
  try {
    const m = renderSocialCards({ ...base, slug: 'no-picture', image: '/uploads/articles/does-not-exist.jpg' }, dir);
    assert.equal(m.media.mode, 'text-led');
    assert.doesNotMatch(readFileSync(join(dir, 'no-picture', 'square.svg'), 'utf8'), /<image /);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Analysis / Opinion: text-led even when a photo exists, headline dominant, byline only for a named person', () => {
  const photoAnalysis = { ...FIXTURES.photo.story, slug: 'photo-analysis', type: 'Analysis' };
  assert.equal(chooseVariant(photoAnalysis, storyMedia(photoAnalysis)), 'analysis');
  const dir = tmp();
  try {
    const m = renderSocialCards(photoAnalysis, dir);
    assert.doesNotMatch(readFileSync(join(dir, 'photo-analysis', 'square.svg'), 'utf8'), /<image /);
    assert.equal(m.sourceMode, 'text-led');
    assert.deepEqual(m.media.usedBy, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const r = render('opinion');
  try {
    const svg = r.read('portrait');
    assert.equal(r.m.variant, 'analysis');
    assert.match(svg, />OPINION</);
    assert.match(svg, />By Fixture Author</);
    assert.match(svg, />“</, 'opening quote ornament on opinion');
    const head = textsOf(svg).filter((t) => t.face === 'normal-600' && t.size > 60);
    assert.ok(head.length >= 2 && head[0].size >= 90, 'headline dominant');
    assertNoOverflow(svg, 'portrait', 'opinion');
  } finally { r.done(); }
  const a = render('analysis');
  try {
    assert.match(a.read('square'), />ANALYSIS · TECHNOLOGY</);
    assert.doesNotMatch(a.read('square'), />By /, 'desk bylines are clutter');
  } finally { a.done(); }
});

test('Breaking / Developing: wine band, status, GMT time, heavier headline; only from the article’s own flag', () => {
  const r = render('breaking');
  try {
    const svg = r.read('square');
    assert.equal(r.m.variant, 'breaking');
    assert.match(svg, /<rect x="0" y="0" width="1080" height="150" fill="#54101F"\/>/);
    assert.match(svg, />BREAKING</);
    assert.match(svg, />30 SEPT · 14:20 GMT</);
    assert.ok(textsOf(svg).some((t) => t.face === 'normal-700' && t.size >= 50), 'bold headline');
    for (const fmt of ['square', 'landscape', 'portrait', 'story']) assertNoOverflow(r.read(fmt), fmt, `breaking/${fmt}`);
    // The Story band sits inside the platform safe zone (below y=250).
    assert.match(r.read('story'), /<rect x="0" y="250" width="1080" height="200" fill="#54101F"\/>/);
  } finally { r.done(); }
  const d = render('developing');
  try { assert.match(d.read('portrait'), />DEVELOPING</); } finally { d.done(); }
  assert.equal(chooseVariant({ ...FIXTURES.photo.story, live: null }, null), 'standard', 'never inferred');
  assert.equal(stamp('2026-09-30'), '30 SEPT 2026');
  assert.equal(stamp(null), '');
});

test('short headline: set large on one line', () => {
  const r = render('short');
  try {
    const hl = r.m.assets.find((a) => a.format === 'square').headline;
    assert.equal(hl.lines, 1);
    assert.ok(hl.size >= 110, `${hl.size}px`);
  } finally { r.done(); }
});

test('long headline: sizes adapt within bounds, fall back to the long layout, then text-led; never microscopic', () => {
  const r = render('longPhoto');
  try {
    for (const a of r.m.assets.filter((x) => x.headline)) {
      assert.ok(a.headline.size >= LEGIBLE[a.format], `${a.format} ${a.headline.size}px`);
      assert.equal(a.headline.clipped, false, a.format);
      assert.match(a.imageDropped || '', /too long for the .* picture layout/, 'long headline drops the picture rather than shrinking the type');
      assertNoOverflow(r.read(a.format), a.format, `long/${a.format}`);
    }
  } finally { r.done(); }
  const x = render('long'); // 272 characters: the last-resort clip, flagged in the manifest
  try {
    assert.equal(x.m.clipped, true);
    for (const a of x.m.assets) {
      assert.ok(a.headline.size >= 36, `${a.format} ${a.headline.size}px`);
      assertNoOverflow(x.read(a.format), a.format, `extreme/${a.format}`);
      assert.match(x.read(a.format), /…<\/text>/);
    }
  } finally { x.done(); }
});

test('fitting: balanced breaks, 2–4 lines preferred, size stays inside its bounds', () => {
  const t = 'Anthropic releases Sonnet 5.5, highlighting speed and lower costs';
  const f = fitText(t, { width: 936, maxSize: 64, minSize: 42, maxLines: 3 });
  assert.ok(f.fitted && f.size <= 64 && f.size >= 42 && f.lines.length <= 3);
  const widths = f.lines.map((l) => measure(l, f.size));
  assert.ok(Math.max(...widths) - Math.min(...widths) < 0.45 * 936, `balanced: ${widths.map(Math.round)}`);
  assert.ok(f.lines.at(-1).split(' ').length >= 2, 'no one-word last line');
  const bl = balanced('A B C D E F G H I J', 400, 60, 'normal-600');
  assert.ok(bl.every((l) => measure(l, 60) <= 400));
  const none = fitText('Supercalifragilisticexpialidocious-Antidisestablishmentarianism', { width: 300, maxSize: 60, minSize: 58, maxLines: 2 });
  assert.equal(none.fitted, false, 'an unbreakable word wider than the column is not forced');
});

test('unsafe text is escaped and control characters removed', () => {
  const r = render('unsafe');
  try {
    for (const fmt of ['square', 'landscape', 'portrait', 'story']) {
      const svg = r.read(fmt);
      assert.doesNotMatch(svg, /<script|<b>|<img|<tags>|onerror=alert/i, fmt);
      assert.match(svg, /&lt;script&gt;/);
      assert.match(svg, /WORLD &amp; &lt;REGION&gt;/);
      assert.doesNotMatch(svg, /\u0007/);
      // Every text node is plain escaped text (no markup inside).
      for (const m of svg.matchAll(/<text [^>]*>([^]*?)<\/text>/g)) assert.doesNotMatch(m[1], /[<>]/);
      assertNoOverflow(svg, fmt, `unsafe/${fmt}`);
    }
  } finally { r.done(); }
});

test('missing optional metadata: no dek, section, author or date still gives a complete card', () => {
  const r = render('minimal');
  try {
    const svg = r.read('square');
    assert.match(svg, />NUVELLUM</);
    assert.match(svg, />nuvellum\.news</);
    assert.doesNotMatch(svg.replace(/data:[^")]+/g, ''), /undefined|null|NaN/, 'no placeholder leaks (font and image data excluded)');
    assert.equal(r.m.quote.kind, undefined);
    for (const fmt of ['square', 'landscape', 'portrait', 'story']) assertNoOverflow(r.read(fmt), fmt, `minimal/${fmt}`);
  } finally { r.done(); }
});

test('quote / key fact: verbatim, self-contained, never for sensitive stories', () => {
  const culture = FIXTURES.culture.story;
  const q = pickQuote(culture);
  assert.equal(q.kind, 'quote');
  assert.ok(culture.sentences.includes(q.text), 'verbatim from the article');
  assert.equal(pickQuote(FIXTURES.photoWorld.story), null, 'sensitive story → no stand-alone card');
  assert.equal(pickQuote({ ...culture, risk: 'low', sentences: ['The UN panel noted that the United States has signed such deals with more than 35 nations, including Burundi.'] }), null, 'back-references rejected');
  const r = render('culture');
  try {
    const svg = r.read('quote-portrait');
    assert.match(svg, />From: Martin McDonagh calls &apos;Wild Horse Nine&apos; his most political film</);
    assertNoOverflow(svg, 'portrait', 'quote');
  } finally { r.done(); }
  const s = render('photoWorld');
  try { assert.match(s.m.quote.skipped, /sensitive/); assert.ok(!s.m.assets.some((a) => a.format.startsWith('quote'))); } finally { s.done(); }
});

test('brand: embedded Newsreader, site palette, N✦ monogram and NUVELLUM✦ wordmark, nuvellum.news', () => {
  const r = render('photo');
  try {
    const svg = r.read('square');
    assert.match(svg, /@font-face\{font-family:NV;font-style:normal;font-weight:300 700;src:url\(data:font\/woff2;base64,/);
    assert.match(svg, /font-family="NV, Newsreader, Georgia/);
    for (const c of ['#F8F4EC', '#17120F', '#76132B']) assert.ok(svg.includes(c), c);
    assert.match(svg, />NUVELLUM</);
    assert.match(svg, />nuvellum\.news</);
    assert.doesNotMatch(svg, /linearGradient|radialGradient/, 'no gradient templates');
    // Latin Extended is embedded only when the text needs it.
    assert.equal((svg.match(/@font-face/g) || []).length, 2);
  } finally { r.done(); }
  const a = render('accents');
  try { assert.equal((a.read('square').match(/@font-face/g) || []).length, 4); } finally { a.done(); }
});

test('Story covers: all content inside y=250–1600; the platform zones hold only marked decoration', () => {
  for (const key of ['photo', 'textLed', 'culture', 'illustration', 'opinion', 'analysis', 'breaking', 'developing', 'short', 'longPhoto', 'minimal']) {
    const r = render(key);
    try {
      const svg = r.read('story');
      for (const t of textsOf(svg)) {
        if (t.content === '“') continue; // opening quote ornament sits inside the zone anyway
        assert.ok(t.y - t.size * 0.8 >= 250 && t.y + t.size * 0.25 <= 1600, `${key}: "${t.content}" (y=${t.y}, ${t.size}px) outside the safe zone`);
      }
      // Decoration outside the zone: the faint N✦ monogram (marked data-decor, no data-box) and, except under a
      // breaking band, the masthead double rule above y=250. Nothing else lives there.
      assert.equal((svg.match(/data-decor="monogram"/g) || []).length, 1, key);
      assert.match(svg, /<text [^>]*font-size="760"[^>]*data-decor="monogram">N<\/text>/);
      const decoText = [...svg.matchAll(/<text [^>]*>/g)].filter((m) => !/data-box=/.test(m[0]));
      assert.ok(decoText.every((m) => /data-decor=/.test(m[0])), `${key}: unmarked text without a fitted box`);
      if (r.m.variant !== 'breaking') assert.match(svg, /<rect x="80" y="192" width="920" height="3" fill="#76132B"\/>/, `${key}: masthead rule`);
      assert.doesNotMatch(svg, /Gradient|filter=/);
    } finally { r.done(); }
  }
});

test('Story covers: the picture composition is centred between header and footer', () => {
  const r = render('photo');
  try {
    const svg = r.read('story');
    const [, y, h] = /<image href="[^"]+" x="80" y="([\d.]+)" width="920" height="([\d.]+)"/.exec(svg).map(Number);
    const heads = textsOf(svg).filter((t) => t.face === 'normal-600' && t.size >= 56);
    const last = heads.at(-1);
    const above = y - 348; // header rule
    const below = 1532 - (last.y + last.size * 0.25); // footer rule
    assert.ok(Math.abs(above - below) < 90, `unbalanced: ${Math.round(above)}px above, ${Math.round(below)}px below`);
  } finally { r.done(); }
});

test('generation is deterministic', () => {
  const a = render('breaking'), b = render('breaking');
  try {
    for (const fmt of ['square', 'story']) assert.equal(a.read(fmt), b.read(fmt));
    assert.deepEqual(a.m.assets.map((x) => x.headline), b.m.assets.map((x) => x.headline));
  } finally { a.done(); b.done(); }
});

// Real-renderer check (Chromium): run with CARDS_CHROME=1 (and CHROMIUM_PATH if needed). CI engine tests run
// without a browser; sample-qa.mjs runs the same check over every fixture.
test('Chromium: rasterised cards keep every line inside its box', { skip: !process.env.CARDS_CHROME }, async () => {
  const { rasterise } = await import('../cards/raster.mjs');
  const r = render('longPhoto');
  try {
    const files = r.m.assets.map((a) => join(REPO_ROOT, a.path));
    const res = await rasterise(files, { png: true });
    for (const x of res) { assert.deepEqual(x.overflow, [], x.file); assert.ok(existsSync(x.png)); }
  } finally { r.done(); }
});
