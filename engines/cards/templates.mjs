// Nuvellum social card templates: four formats × four variants, plus quote / key-fact cards.
//
// Composition rule: text never sits on a photograph. The picture has its own panel, and anything placed on it
// (the FILE PHOTO / ILLUSTRATION label) is a solid chip, so contrast is guaranteed and faces or busy areas are
// never covered by the headline. Everything lives inside each format's safe zone.
import { fitText, measure } from './fit.mjs';
import { C, SITE, text, lines, kicker, chip, star, wordmark, monogram, picture, svg, fontCss, esc } from './kit.mjs';
import { coverAlign } from './media.mjs';

export const FORMATS = {
  square: { w: 1080, h: 1080, m: 72, top: 0, bottom: 1080, use: 'feed (X, Facebook, LinkedIn, Threads, Telegram)' },
  landscape: { w: 1200, h: 630, m: 60, top: 0, bottom: 630, use: 'link card / og:image, Telegram, X summary_large_image' },
  portrait: { w: 1080, h: 1350, m: 72, top: 0, bottom: 1350, use: 'Instagram / Facebook feed' },
  // Stories/Reels/Shorts: platform UI covers roughly the top 250px and bottom 320px; keep content between.
  story: { w: 1080, h: 1920, m: 80, top: 250, bottom: 1600, use: 'Instagram/Facebook Story, Reel/Short cover, TikTok cover' }
};

const CULTURE = new Set(['culture', 'film & tv', 'film', 'cinema', 'gaming', 'anime', 'screen & play', 'entertainment', 'music', 'books', 'arts', 'television', 'tv']);
const ARGUMENT = new Set(['analysis', 'opinion', 'ideas', 'essay', 'column', 'comment']);

/** Template for a story: breaking | analysis | culture | standard. */
export function chooseVariant(story, media) {
  if (story.live) return 'breaking';
  if (ARGUMENT.has(String(story.type).toLowerCase()) || /^opinion$/i.test(story.section)) return 'analysis';
  if (media && CULTURE.has(String(story.section).toLowerCase())) return 'culture';
  return 'standard';
}

/** Byline only for a named person; desk bylines ("Nuvellum Global Desk") would be clutter. */
export const byline = (story) => (story.author && !/desk|team|staff|nuvellum/i.test(story.author) ? `By ${story.author.replace(/^By\s+/i, '')}` : '');

/** "30 SEP · 14:20 GMT" from publishedAt (UTC, deterministic), or the date alone. */
export function stamp(published) {
  const s = String(published || '');
  const t = Date.parse(s);
  if (!t) return '';
  const d = new Date(t), mon = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  return /T\d/.test(s) ? `${d.getUTCDate()} ${mon} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} GMT` : `${d.getUTCDate()} ${mon} ${d.getUTCFullYear()}`;
}

// Headline sizes per format: [maxSize, minSize, maxLines] for the normal layout and the long-headline layout.
const HEAD = {
  image: { square: [[64, 42, 3], [50, 36, 4]], portrait: [[70, 46, 4], [54, 38, 5]], landscape: [[52, 34, 4], [42, 30, 5]], story: [[86, 56, 4], [66, 46, 6]] },
  text: { square: [[118, 58, 4], [66, 46, 6]], portrait: [[128, 62, 5], [74, 48, 7]], landscape: [[88, 46, 3], [56, 36, 4]], story: [[150, 70, 5], [86, 56, 7]] },
  breaking: { square: [[76, 50, 3], [56, 40, 4]], portrait: [[84, 54, 3], [62, 44, 5]], landscape: [[60, 40, 3], [46, 32, 4]], story: [[100, 64, 4], [74, 50, 6]] }
};

const COMFORT = { square: 52, portrait: 58, story: 72 };
// Below these sizes a headline beside or under a picture stops reading well on a phone; such a card falls back
// to the text-led layout, which can carry a long headline at a larger size.
export const LEGIBLE = { square: 44, portrait: 48, landscape: 34, story: 56 };

/** One card. Returns { svg, meta } where meta records the fit so the manifest and tests can check it. */
export function renderCard(fmtName, story, media, variant) {
  const card = layoutCard(fmtName, story, media, variant);
  if (card.meta.image && (card.meta.headline.size < LEGIBLE[fmtName] || card.meta.headline.clipped)) {
    const text = layoutCard(fmtName, story, null, variant);
    text.meta.imageDropped = `headline too long for the ${fmtName} picture layout (${card.meta.headline.size}px${card.meta.headline.clipped ? ', clipped' : ''})`;
    return text;
  }
  return card;
}

/** Fit a headline, trying the normal then the long layout; the last attempt clips (and says so). */
function headline(title, kind, fmt, width, maxHeight, face) {
  const [norm, long] = HEAD[kind][fmt];
  const a = fitText(title, { width, maxSize: norm[0], minSize: norm[1], maxLines: norm[2], maxHeight, face, leading: 1.08 });
  if (a.fitted) return { ...a, layout: 'normal' };
  const b = fitText(title, { width, maxSize: long[0], minSize: long[1], maxLines: long[2], maxHeight, face, leading: 1.1, clip: true });
  return { ...b, layout: b.fitted ? 'long' : 'clipped' };
}

function header(f, story, variant, { onDark = false } = {}) {
  const { w, m, top } = f;
  const size = f.w >= 1200 ? 26 : f === FORMATS.story ? 34 : 28;
  const right = f.right ?? w - m;
  const y = (f === FORMATS.story ? top + 40 : m) + size * 0.8;
  const wm = wordmark(m, y, size, { fill: onDark ? C.paper2 : C.ink, starFill: onDark ? C.onDarkMuted : C.burgundy });
  const label = variant === 'analysis' ? [story.type || 'Analysis', story.section].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ') : story.section || 'Nuvellum';
  const k = kicker(label, right, y, { size: Math.round(size * 0.66), fill: onDark ? C.onDarkMuted : C.burgundy, anchor: 'end', min: m + wm.width + 24, max: right });
  const ruleY = y + size * 0.9;
  return { svg: wm.svg + k + `<line x1="${m}" y1="${ruleY}" x2="${right}" y2="${ruleY}" stroke="${onDark ? C.onDarkMuted : C.rule}" stroke-opacity="${onDark ? 0.5 : 1}"/>`, bottom: ruleY };
}

/** Breaking/developing: a wine band carrying the wordmark, the status and the time. */
function breakingHeader(f, story) {
  const { w, m, top } = f;
  const story9 = f === FORMATS.story;
  const bandTop = story9 ? top : 0, bandH = story9 ? 200 : f.w >= 1200 ? 118 : 150;
  const size = f.w >= 1200 ? 24 : story9 ? 32 : 28;
  const wm = wordmark(m, bandTop + m * 0.55 + size, size, { fill: C.paper2, starFill: C.onDarkMuted });
  const status = story.live === 'developing' ? 'Developing' : 'Breaking';
  const sy = bandTop + bandH - m * 0.45;
  const sSize = Math.round(size * 0.86);
  const dot = `<circle cx="${m + sSize * 0.35}" cy="${sy - sSize * 0.36}" r="${sSize * 0.3}" fill="${C.paper2}"/>`;
  const st = kicker(status, m + sSize * 1.0, sy, { size: sSize, fill: C.paper2 });
  const time = stamp(story.publishedAt);
  const tm = time ? kicker(time, w - m, sy, { size: Math.round(sSize * 0.8), fill: C.onDarkMuted, anchor: 'end', max: w - m }) : '';
  const sec = kicker(story.section || 'Nuvellum', w - m, bandTop + m * 0.55 + size, { size: Math.round(size * 0.66), fill: C.onDarkMuted, anchor: 'end', max: w - m });
  return { svg: `<rect x="0" y="${bandTop}" width="${w}" height="${bandH}" fill="${C.wine2}"/>` + (story9 ? `<rect x="0" y="0" width="${w}" height="${bandTop}" fill="${C.wine2}"/>` : '') + `<rect x="0" y="${bandTop + bandH}" width="${w}" height="6" fill="${C.burgundy}"/>` + wm.svg + sec + dot + st + tm, bottom: bandTop + bandH + 6 };
}

function footer(f, { cta = false } = {}) {
  const { w, m, bottom } = f;
  const right = f.right ?? w - m;
  const size = f.w >= 1200 ? 20 : f === FORMATS.story ? 30 : 22;
  const y = bottom - (f === FORMATS.story ? 20 : m * 0.75);
  const ruleY = y - size * 1.6;
  const mid = m + (right - m) / 2;
  const left = cta ? kicker('Read the full story', m, y, { size: Math.round(size * 0.8), fill: C.burgundy, max: mid }) : text('Beyond the headline.', { x: m, y, size, face: 'italic-400', fill: C.muted, max: mid });
  return { svg: `<line x1="${m}" y1="${ruleY}" x2="${right}" y2="${ruleY}" stroke="${C.rule}"/>` + left + text(SITE, { x: right, y, size, face: 'normal-600', fill: C.ink, anchor: 'end', min: mid, max: right }), top: ruleY };
}

function fitDek(dek, width, size, room) {
  if (!dek || room < size * 1.4) return null;
  const maxLines = Math.min(3, Math.floor(room / (size * 1.32)));
  if (maxLines < 1) return null;
  const d = fitText(dek, { width, maxSize: size, minSize: size, maxLines, face: 'italic-400', leading: 1.32, clip: true });
  return d.lines ? d : null;
}

/** Lays out one card with the given media (null = text-led). */
function layoutCard(fmtName, story, media, variant) {
  const f = FORMATS[fmtName];
  const { w, h, m } = f;
  const useImage = media && variant !== 'analysis';
  const head = variant === 'breaking' ? breakingHeader(f, story) : header(f, story, variant);
  const foot = footer(f, { cta: fmtName === 'story' });
  const colW = w - 2 * m;
  let body = '', meta = { format: fmtName, width: w, height: h, variant, image: useImage ? media.mode : null };
  const hFace = variant === 'breaking' ? 'normal-700' : 'normal-600';

  if (useImage && fmtName === 'landscape') {
    // Picture on the right, text column on the left; header rule and footer stop at the column so no text
    // or line ever crosses the photograph. A breaking band still spans the full width, above the picture.
    const imgW = variant === 'culture' ? 640 : 560, imgX = w - imgW;
    const col = { ...f, right: imgX - 44 };
    const hd = variant === 'breaking' ? head : header(col, story, variant);
    const ft = footer(col);
    const imgY = variant === 'breaking' ? hd.bottom : 0;
    body += picture(media, coverAlign(media, imgW, h - imgY), imgX, imgY, imgW, h - imgY, 'pic');
    body += chip(media.label, imgX + 18, h - 18, { size: 13 });
    if (media.credit) body += chip(clipTo(media.credit, imgW - 190, 12), w - 18, h - 18, { size: 12, anchor: 'end' });
    const tw = col.right - m;
    const top = hd.bottom + 48, room = ft.top - 30 - top;
    const hl = headline(story.title, variant === 'breaking' ? 'breaking' : 'image', fmtName, tw, room, hFace);
    body += lines(hl, { x: m, y: top + hl.size * 0.82, face: hFace, min: m, max: m + tw });
    meta.headline = pick(hl);
    return { svg: frame(f, hd, ft, body, story, variant), meta };
  }

  if (useImage) {
    const gap = fmtName === 'story' ? 44 : 34;
    const share = { square: variant === 'culture' ? 0.56 : 0.46, portrait: variant === 'culture' ? 0.58 : 0.48, story: variant === 'culture' ? 0.48 : 0.42 }[fmtName];
    let imgH = Math.round((f.bottom - f.top) * share);
    const imgY = head.bottom + gap * 0.8;
    // Headline room below the picture; shrink the picture (never below 60%) before resorting to clipping.
    let hl, y;
    for (let k = 0; k < 4; k++) {
      y = imgY + imgH + gap + 30;
      hl = headline(story.title, variant === 'breaking' ? 'breaking' : 'image', fmtName, colW, foot.top - gap - y, hFace);
      // Image-forward layouts give the picture up to ~36% of its height before the headline drops below a
      // comfortable reading size.
      if ((hl.layout === 'normal' && hl.size >= COMFORT[fmtName]) || k === 3) break;
      imgH = Math.round(imgH * 0.86);
    }
    body += picture(media, coverAlign(media, colW, imgH), m, imgY, colW, imgH, 'pic');
    body += chip(media.label, m + 16, imgY + imgH - 16, { size: fmtName === 'story' ? 18 : 14 });
    if (media.credit) body += text(clipTo(media.credit, colW * 0.7, 15), { x: w - m, y: imgY + imgH + 26, size: fmtName === 'story' ? 18 : 15, face: 'normal-400', fill: C.muted, anchor: 'end', min: w - m - colW * 0.72, max: w - m });
    body += lines(hl, { x: m, y: y + hl.size * 0.8, face: hFace, min: m, max: m + colW });
    const after = y + hl.size * 0.8 + (hl.lines.length - 1) * hl.leading;
    // The dek only where it has real room (portrait/story), never crowding the footer.
    if (fmtName !== 'square') {
      const dSize = fmtName === 'story' ? 38 : 30;
      const dk = fitDek(story.dek, colW, dSize, foot.top - gap - (after + dSize * 2.1));
      if (dk) body += lines(dk, { x: m, y: after + dSize * 2.1, face: 'italic-400', fill: C.muted, min: m, max: m + colW });
      meta.dek = dk ? pick(dk) : null;
    }
    meta.headline = pick(hl);
    meta.imageHeight = imgH;
    return { svg: frame(f, head, foot, body, story, variant), meta };
  }

  // Text-led: typographic composition with the monogram as a watermark. Analysis/Opinion add a byline.
  const kind = variant === 'breaking' ? 'breaking' : 'text';
  const top = head.bottom + (fmtName === 'landscape' ? 40 : 70), bottomY = foot.top - (fmtName === 'landscape' ? 30 : 60);
  const mono = fmtName === 'landscape' ? 300 : fmtName === 'story' ? 640 : 480;
  body += monogram(w - m - mono * 0.86, top + mono * 0.78 + (fmtName === 'story' ? 40 : 0), mono, { fill: variant === 'breaking' ? C.wine : C.ghost, opacity: variant === 'breaking' ? 0.08 : 1 });
  // Opinion / Ideas / Essay carry a large opening quote mark above the headline (the glyph's ink spans roughly
  // 0.42–0.72 em above its baseline); its height is reserved before the block is centred.
  const qSize = /opinion|ideas|essay|column|comment/i.test(`${story.type} ${story.section}`) && variant === 'analysis' ? (fmtName === 'landscape' ? 110 : fmtName === 'story' ? 240 : 190) : 0;
  const reserve = qSize ? qSize * 0.32 + 18 : 0;
  const hl = headline(story.title, kind, fmtName, colW - (fmtName === 'landscape' ? 60 : 0), bottomY - top - reserve - (fmtName === 'landscape' ? 0 : 140), hFace);
  const by = variant === 'analysis' ? byline(story) : '';
  const dSize = { square: 30, portrait: 34, landscape: 0, story: 42 }[fmtName];
  const hlH = hl.size * 0.8 + (hl.lines.length - 1) * hl.leading;
  const ruleGap = fmtName === 'landscape' ? 0 : 56;
  const dk = dSize ? fitDek(story.dek, colW, dSize, bottomY - top - hlH - ruleGap - dSize * 1.4 - (by ? dSize * 1.8 : 0)) : null;
  const dkH = dk ? dSize * 1.4 + (dk.lines.length - 1) * dk.leading + dSize * 0.3 : 0;
  const byH = by ? dSize * 1.8 : 0;
  const block = hlH + (ruleGap ? ruleGap : 0) + dkH + byH;
  // Vertically centre the block in the free area (quote mark and monogram sit behind it).
  const y0 = top + reserve + hl.size * 0.62 + Math.max(0, (bottomY - top - reserve - hl.size * 0.62 - block) / 2);
  if (qSize) body += text('“', { x: m - qSize * 0.06, y: y0 - hl.size * 0.66 - 14 + qSize * 0.42, size: qSize, face: 'normal-600', fill: C.burgundy, max: m + qSize });
  body += `<rect x="${m - 30}" y="${y0 - hl.size * 0.72}" width="6" height="${hlH + hl.size * 0.2}" fill="${C.burgundy}"/>`;
  body += lines(hl, { x: m, y: y0 + hl.size * 0.08, face: hFace, min: m, max: m + colW });
  let y = y0 + hlH;
  if (ruleGap) { body += `<line x1="${m}" y1="${y + ruleGap * 0.55}" x2="${m + 220}" y2="${y + ruleGap * 0.55}" stroke="${C.burgundy}" stroke-width="4"/>`; y += ruleGap; }
  if (dk) { body += lines(dk, { x: m, y: y + dSize * 1.1, face: 'italic-400', fill: C.muted, min: m, max: m + colW }); y += dkH; }
  if (by) body += text(by, { x: m, y: y + dSize * 1.2, size: Math.round(dSize * 0.8), face: 'normal-700', fill: C.ink, ls: 1, max: m + colW });
  meta.headline = pick(hl); meta.dek = dk ? pick(dk) : null; meta.byline = by || null;
  return { svg: frame(f, head, foot, body, story, variant), meta };
}

const pick = (fit) => ({ size: fit.size, lines: fit.lines.length, layout: fit.layout ?? 'normal', clipped: !!fit.clipped });

/** Clip a one-line string to a pixel width (credits). */
function clipTo(s, width, size) {
  let t = String(s);
  if (measure(t, size, 'normal-400') <= width) return t;
  while (t.length > 4 && measure(t + '…', size, 'normal-400') > width) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function frame(f, head, foot, body, story, variant) {
  const all = [story.title, story.dek, story.section, story.author, story.type].join(' ');
  const left = variant === 'breaking' || f === FORMATS.landscape ? '' : `<rect x="0" y="0" width="10" height="${f.h}" fill="${C.burgundy}"/>`;
  return svg(f.w, f.h, left + head.svg + body + foot.svg, { fonts: fontCss(all + ' Beyond the headline.', { italic: true }), bg: C.paper, title: story.title });
}

// ---------- Quote / key fact ----------

const STAT = /(?:[$£€]\s?\d|\d[\d,.]*\s?(?:%|per ?cent|percent|bn\b|billion|million|trillion|m\b)|\b\d{2,}[\d,]*\s+(?:people|deaths|nations|countries|cards|votes|jobs|homes))/i;
const QUOTED = /[“"]([^”"]{25,200})[”"]/;

/**
 * A verbatim line from the article worth its own card: a direct quote (not for sensitive stories, where a
 * quote on its own can strip allegations of context) or a key statistic. Returns { kind, text } or null.
 */
// A card stands alone, so its line must too: no sentence that opens on, or leans on, earlier context.
const NEEDS_CONTEXT = /^(however|meanwhile|also|but|and|still|instead|yet|so|in addition|additionally|as a result|it|its|they|their|he|she|his|her|this|these|those|that|there)\b/i;
const REFERS_BACK = /\b(such|these|those|the same|the latter|the former|similar|likewise|again|further|another)\b/i;

export function pickQuote(story) {
  // Sensitive stories (deaths, allegations, conflict) get no pull-quote or key-fact card: a single line on its
  // own card strips context, and a casualty figure is not a promotional graphic.
  if (story.risk === 'sensitive') return null;
  const pool = (story.sentences || []).filter((s) => s.length >= 50 && s.length <= 230 && !NEEDS_CONTEXT.test(s) && !REFERS_BACK.test(s.replace(QUOTED, '')));
  const q = pool.find((s) => QUOTED.test(s) && /\b(said|says|told|added|according)\b/i.test(s)) || pool.find((s) => QUOTED.test(s));
  if (q) return { kind: 'quote', text: q };
  const s = pool.find((x) => STAT.test(x));
  return s ? { kind: 'fact', text: s } : null;
}

export function renderQuoteCard(fmtName, story, q) {
  const f = FORMATS[fmtName];
  const { w, m } = f;
  const head = header(f, story, 'standard');
  const foot = footer(f);
  const colW = w - 2 * m;
  const top = head.bottom + 60, bottomY = foot.top - 60;
  const markSize = fmtName === 'portrait' ? 240 : 200;
  const qFace = q.kind === 'quote' ? 'italic-400' : 'normal-600';
  const leadH = q.kind === 'quote' ? markSize * 0.5 : 110;
  const context = `From: ${story.title}`;
  const ctxFit = fitText(context, { width: colW, maxSize: 24, minSize: 24, maxLines: 2, face: 'normal-400', leading: 1.3, clip: true });
  const ctxH = ctxFit.lines.length * ctxFit.leading + 70;
  const fit = fitText(q.text, { width: colW, maxSize: fmtName === 'portrait' ? 64 : 56, minSize: 34, maxLines: fmtName === 'portrait' ? 8 : 7, maxHeight: bottomY - top - leadH - ctxH, face: qFace, leading: 1.22, clip: true });
  // Centre the whole block (mark or kicker, quote, rule, context) between header and footer.
  const blockH = leadH + fit.size + (fit.lines.length - 1) * fit.leading + ctxH;
  const y0 = top + Math.max(0, (bottomY - top - blockH) / 2);
  let body = q.kind === 'quote'
    ? text('“', { x: m - 10, y: y0 + markSize * 0.62, size: markSize, face: 'normal-600', fill: C.burgundy, max: m + 200 })
    : star(m + 22, y0 + 40, 22) + kicker('Key fact', m + 60, y0 + 50, { size: 22 });
  const qTop = y0 + leadH;
  body += lines(fit, { x: m, y: qTop + fit.size, face: qFace, min: m, max: m + colW });
  const after = qTop + fit.size + (fit.lines.length - 1) * fit.leading + 50;
  body += `<line x1="${m}" y1="${after}" x2="${m + 120}" y2="${after}" stroke="${C.burgundy}" stroke-width="3"/>`;
  body += lines(ctxFit, { x: m, y: after + 44, face: 'normal-400', fill: C.muted, min: m, max: m + colW });
  const all = [q.text, context, story.section].join(' ');
  return { svg: svg(f.w, f.h, `<rect x="0" y="0" width="10" height="${f.h}" fill="${C.burgundy}"/>` + head.svg + body + foot.svg, { fonts: fontCss(all + ' Beyond the headline.', { italic: true }), title: q.text }), meta: { format: `quote-${fmtName}`, width: f.w, height: f.h, variant: q.kind, quote: { size: fit.size, lines: fit.lines.length, clipped: !!fit.clipped } } };
}

export { esc };
