// Scene plan: turns narrated lines into a deterministic timeline of scenes and
// caption "pages" with per-word timing. Everything downstream (HTML frames,
// SRT captions, audio placement) is derived from this single plan.
import { MIN_SECONDS, END_CARD_SECONDS } from './script.mjs';

const LEAD_IN = 0.3;
const GAP = 0.18;

function captionPages(text, maxWords = 4) {
  const w = String(text).split(/\s+/).filter(Boolean);
  const pages = [];
  for (let i = 0; i < w.length;) {
    let n = Math.min(maxWords, w.length - i);
    // Avoid leaving a single orphan word on the last page.
    if (w.length - (i + n) === 1) n = Math.max(2, n - 1);
    pages.push(w.slice(i, i + n));
    i += n;
  }
  return pages;
}

export function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

const OUTLETS = { 'bbc.co.uk': 'BBC', 'bbc.com': 'BBC', 'reuters.com': 'Reuters', 'aljazeera.com': 'Al Jazeera', 'dw.com': 'DW', 'france24.com': 'France 24', 'cbsnews.com': 'CBS News', 'theguardian.com': 'The Guardian', 'cnbc.com': 'CNBC', 'deadline.com': 'Deadline', 'variety.com': 'Variety', 'criticalthreats.org': 'Critical Threats' };

export function buildPlan(story, narrated, { fps = 30 } = {}) {
  let t = LEAD_IN;
  const lines = narrated.lines.map((l, i) => {
    const start = t;
    const end = start + l.seconds;
    t = end + GAP;
    const pages = captionPages(l.text);
    const totalChars = pages.flat().reduce((a, w) => a + w.length + 1, 0) || 1;
    let pt = start;
    const capPages = pages.map(ws => {
      const chars = ws.reduce((a, w) => a + w.length + 1, 0);
      const dur = (end - start) * chars / totalChars;
      let wt = pt;
      const wordsTimed = ws.map(w => { const d = dur * (w.length + 1) / chars; const o = { w, start: wt, end: wt + d }; wt += d; return o; });
      const p = { start: pt, end: pt + dur, words: wordsTimed };
      pt += dur;
      return p;
    });
    return { index: i, role: narrated.roles?.[i] || (i === 0 ? 'hook' : 'beat'), text: l.text, audio: l.file, start, end, pages: capPages };
  });
  const speechEnd = t;
  const endCardStart = speechEnd;
  const total = Math.max(MIN_SECONDS, endCardStart + END_CARD_SECONDS);
  const outlets = [...new Set(story.sourceUrls.map(u => OUTLETS[hostOf(u)] || hostOf(u)).filter(Boolean))];
  return {
    fps,
    width: 1080,
    height: 1920,
    total: Math.round(total * fps) / fps,
    frames: Math.round(total * fps),
    endCardStart,
    lines,
    story: {
      slug: story.slug, title: story.title, section: story.section, type: story.type, url: story.url,
      sourceLine: outlets.length ? `Nuvellum reporting from ${outlets.slice(0, 3).join(', ')}` : 'Nuvellum reporting',
      imageKind: story.image.kind
    }
  };
}

const srtTime = (s) => {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const sec = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`;
};

export function toSrt(plan) {
  let n = 0;
  return plan.lines.flatMap(l => l.pages.map(p => `${++n}\n${srtTime(p.start)} --> ${srtTime(p.end)}\n${p.words.map(w => w.w).join(' ')}\n`)).join('\n');
}
