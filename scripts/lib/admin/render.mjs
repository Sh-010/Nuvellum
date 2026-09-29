// Preview rendering for the admin. Deliberately small and strict: all text is HTML-escaped first, then
// only the Markdown the editor offers (H2/H3, paragraphs, bold, italic, links, blockquotes, lists and
// inline code) is turned into markup. Links render only when the target is allowed by the same rule the
// repository validator applies (SAFE_LINK_RE). The markup mirrors src/pages/article/[slug].astro so the
// site's own article CSS styles it.
import { SAFE_LINK_RE } from '../article-rules.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unesc = (s) => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[k]));

export function headingId(text) {
  return String(text).toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
}

function inline(raw) {
  let s = esc(raw);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(`<code>${c}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, (m, alt) => alt); // inline images are not part of the house style
  s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\s*\)/g, (m, text, href) => {
    const url = unesc(href);
    if (!SAFE_LINK_RE.test(url)) return text;
    const external = /^https?:/i.test(url);
    return `<a href="${esc(url)}"${external ? ' rel="noopener nofollow"' : ''}>${text}</a>`;
  });
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>');
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => codes[Number(i)]);
}

/** Render the article body. Returns { html, headings } (headings feed the "In this story" list). */
export function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const used = new Map();
  let i = 0;
  const isBlank = (l) => !l || !l.trim();
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const depth = h[1].length <= 2 ? 2 : 3;
      let id = headingId(h[2]);
      const n = used.get(id) || 0; used.set(id, n + 1); if (n) id = `${id}-${n}`;
      headings.push({ depth, slug: id, text: h[2] });
      out.push(`<h${depth} id="${esc(id)}">${inline(h[2])}</h${depth}>`);
      i++; continue;
    }
    if (/^\s*>/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push(`<blockquote>${renderMarkdown(q.join('\n')).html}</blockquote>`);
      continue;
    }
    const li = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      const ordered = /\d/.test(li[1]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (m && /\d/.test(m[1]) === ordered) { items.push(m[2]); i++; continue; }
        if (!isBlank(lines[i]) && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1] += ' ' + lines[i].trim(); i++; continue; }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !/^\s*>/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { para.push(lines[i].trim()); i++; }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { html: out.join('\n'), headings };
}

const initials = (name) => String(name || '').replace(/^By\s+/i, '').split(/[\s.]+/).filter(Boolean).map((w) => w[0].toUpperCase()).slice(0, 2).join('');
const longDate = (iso) => {
  const t = Date.parse(String(iso || '').length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
};

/**
 * Article preview markup (the reading page's article element). `imageSrc` is an https URL or a
 * /uploads path already validated by the caller; for an upload not yet committed pass
 * imageSrc: null, pendingUpload: true and the client fills the <img> from the local file.
 */
export function renderPreview(data, body, { imageSrc = null, pendingUpload = false } = {}) {
  const { html, headings } = renderMarkdown(body);
  const toc = headings.filter((h) => h.depth === 2 || h.depth === 3);
  const kicker = `<div class="opening-kicker"><span class="eyebrow">✦ ${esc(data.section)}</span><span class="sep" aria-hidden="true">/</span><span class="type">${esc(data.type || 'News')}</span></div>`;
  const updated = data.updated ? `<span class="dot">●</span>Updated ${esc(longDate(data.updated))}` : '';
  const by = `<div class="byline-row"><span class="by-mark" aria-hidden="true">${esc(initials(data.author))}</span><div class="by-text"><span class="by-name">By ${esc(data.author)}</span><span class="by-meta">${esc(longDate(data.publishedAt || data.date))}${updated}<span class="dot">●</span>${esc(data.readingTime)} read</span></div></div>`;
  const hasImage = Boolean(imageSrc || pendingUpload);
  const caption = [data.imageCaption, data.imageCredit ? `Photo: ${data.imageCredit}` : '', data.imageLicense].filter(Boolean).map(esc).join(' · ');
  const figure = hasImage
    ? `<figure class="rgrid lead-figure"><div class="lead-media"><img ${pendingUpload ? 'data-pending-upload' : `src="${esc(imageSrc)}"`} alt="${esc(data.imageAlt)}"></div><figcaption><span class="eyebrow">✦ Nuvellum</span> ${caption}</figcaption></figure>`
    : '<div class="rgrid text-led-rule" aria-hidden="true"><span>✦</span></div>';
  const tocHtml = toc.length
    ? `<details class="toc" open><summary><span class="eyebrow">In this story</span><span class="toc-count">${toc.length} ${toc.length === 1 ? 'section' : 'sections'}</span></summary><nav><ol>${toc.map((h, i) => `<li${h.depth === 3 ? ' class="toc-sub"' : ''}><a href="#${esc(h.slug)}"><span class="toc-num">${String(i + 1).padStart(2, '0')}</span>${esc(h.text)}</a></li>`).join('')}</ol></nav></details>`
    : '';
  return `<article class="story-page">
<header class="rgrid opening"><div class="opening-main">${kicker}<h1 id="story-title">${esc(data.title)}</h1><p class="standfirst">${esc(data.dek)}</p>${by}</div></header>
${figure}
<div class="rgrid reading"><aside class="reading-rail">${tocHtml}</aside><div class="reading-col"><div class="body" id="articleBody">${html}</div></div>
<aside class="reading-notes"><div class="story-file"><span class="eyebrow">Story file</span><dl class="facts"><div><dt>Section</dt><dd>${esc(data.section)}</dd></div><div><dt>Format</dt><dd>${esc(data.type || 'News')}</dd></div><div><dt>Published</dt><dd>${esc(longDate(data.publishedAt || data.date))}</dd></div><div><dt>Reading</dt><dd>${esc(data.readingTime)}</dd></div></dl></div></aside></div>
</article>`;
}
