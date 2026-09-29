// Markdown formatting for the admin editor's toolbar and shortcuts. Pure and DOM-free: given the body text
// and the selection it returns one targeted edit { from, to, text, selStart, selEnd } (selection positions are
// in the edited text), so the editor can replace just that span and put the caret, selection and scroll back
// where they were. Controls toggle rather than stack (bold twice removes it; H2 <-> H3 switches level; lists
// and quotes never double their markers). Only Markdown the site renders is produced: no HTML, ever.

export const FORMAT_ACTIONS = Object.freeze(['h2', 'h3', 'bold', 'italic', 'code', 'link', 'quote', 'ul', 'ol', 'hr']);

const PLACEHOLDER = { bold: 'bold text', italic: 'italic text', code: 'code', link: 'link text', h2: 'Section heading', h3: 'Subheading', quote: 'Quotation', ul: 'List item', ol: 'List item' };

/** Links from the toolbar must be https:// (the site's link rule also allows relative links; typed ones stay possible). */
export const isSafeLinkUrl = (url) => /^https:\/\/[^\s()<>"'`\\]+$/i.test(String(url || ''));

const clampPos = (value, n) => Math.max(0, Math.min(value.length, Number.isFinite(n) ? n : 0));

/** Main entry. `opts.url` is required when a link is being added (see linkIntent). Returns null when there is nothing to do. */
export function formatMarkdown(value, start, end, action, opts = {}) {
  value = String(value ?? '');
  let s = clampPos(value, start), e = clampPos(value, end);
  if (e < s) [s, e] = [e, s];
  switch (action) {
    case 'bold': return toggleInline(value, s, e, ['**', '__'], PLACEHOLDER.bold);
    case 'italic': return toggleInline(value, s, e, ['*', '_'], PLACEHOLDER.italic);
    case 'code': return toggleInline(value, s, e, ['`'], PLACEHOLDER.code);
    case 'link': return toggleLink(value, s, e, opts.url);
    case 'h2': return editLines(value, s, e, headingRule(2), PLACEHOLDER.h2);
    case 'h3': return editLines(value, s, e, headingRule(3), PLACEHOLDER.h3);
    case 'quote': return editLines(value, s, e, quoteRule, PLACEHOLDER.quote);
    case 'ul': return editLines(value, s, e, bulletRule, PLACEHOLDER.ul);
    case 'ol': return editLines(value, s, e, numberRule, PLACEHOLDER.ol);
    case 'hr': return insertRule(value, e);
    default: return null;
  }
}

// ---------- inline: bold, italic, code ----------

// Selection without surrounding whitespace, so markers hug the words ("** word **" is not bold).
function tight(value, s, e) {
  let a = s, b = e;
  while (a < b && /\s/.test(value[a])) a++;
  while (b > a && /\s/.test(value[b - 1])) b--;
  return [a, b];
}
const runBefore = (value, at, ch) => { let n = 0; while (at - n - 1 >= 0 && value[at - n - 1] === ch) n++; return n; };
const runAfter = (value, at, ch) => { let n = 0; while (at + n < value.length && value[at + n] === ch) n++; return n; };
const leadRun = (text, ch) => { let n = 0; while (n < text.length && text[n] === ch) n++; return n; };
const tailRun = (text, ch) => { let n = 0; while (n < text.length && text[text.length - 1 - n] === ch) n++; return n; };
// A single-character marker (italic, code) is present when an odd run surrounds the text ("***x***" is bold italic).
const has = (run, marker) => (marker.length === 2 ? run >= 2 : run % 2 === 1);

function toggleInline(value, s, e, markers, placeholder) {
  const [a, b] = tight(value, s, e);
  const inner = value.slice(a, b);
  if (a < b) {
    for (const m of markers) {
      const ch = m[0], n = m.length;
      // Markers included in the selection: "**word**" selected -> "word"
      if (inner.length > 2 * n && has(leadRun(inner, ch), m) && has(tailRun(inner, ch), m)) {
        const text = inner.slice(n, inner.length - n);
        return { from: a, to: b, text, selStart: a, selEnd: a + text.length };
      }
      // Markers just outside the selection: "**[word]**" -> "word"
      if (has(runBefore(value, a, ch), m) && has(runAfter(value, b, ch), m)) {
        return { from: a - n, to: b + n, text: inner, selStart: a - n, selEnd: b - n };
      }
    }
    const m = markers[0];
    return { from: a, to: b, text: m + inner + m, selStart: a + m.length, selEnd: b + m.length };
  }
  // Nothing (or only spaces) selected: insert markers around a selected placeholder.
  const at = e, m = markers[0];
  return { from: at, to: at, text: m + placeholder + m, selStart: at + m.length, selEnd: at + m.length + placeholder.length };
}

// ---------- links ----------

const LINK_RE = /^\[([^\]\n]*)\]\(([^)\s]*)\)$/;

/** 'unlink' when the selection is (or sits inside) a link, otherwise 'link' (a URL is needed). */
export function linkIntent(value, start, end) {
  value = String(value ?? '');
  const [a, b] = tight(value, clampPos(value, Math.min(start, end)), clampPos(value, Math.max(start, end)));
  if (LINK_RE.test(value.slice(a, b))) return 'unlink';
  if (a > 0 && value[a - 1] === '[' && /^\]\([^)\s]*\)/.test(value.slice(b))) return 'unlink';
  return 'link';
}

function toggleLink(value, s, e, url) {
  const [a, b] = tight(value, s, e);
  const inner = value.slice(a, b);
  const whole = inner.match(LINK_RE);
  if (whole) return { from: a, to: b, text: whole[1], selStart: a, selEnd: a + whole[1].length };
  const tail = a > 0 && value[a - 1] === '[' ? value.slice(b).match(/^\]\([^)\s]*\)/) : null;
  if (tail) return { from: a - 1, to: b + tail[0].length, text: inner, selStart: a - 1, selEnd: b - 1 };
  if (!isSafeLinkUrl(url)) return null;
  const label = inner && !inner.includes('\n') ? inner : PLACEHOLDER.link;
  const from = inner.includes('\n') ? e : a, to = inner.includes('\n') ? e : b;
  return { from, to, text: `[${label}](${url})`, selStart: from + 1, selEnd: from + 1 + label.length };
}

// ---------- line formats: headings, quotes, lists ----------

// Each rule: prefix(line) -> the existing marker to replace; all(lines) -> true when every line already has
// this exact format (so the button removes it); next(i) -> the marker to apply to the i-th non-empty line.
const headingRule = (level) => ({
  prefix: (l) => (l.match(/^\s{0,3}#{1,6}\s+/) || [''])[0],
  all: (ls) => ls.every((l) => new RegExp(`^\\s{0,3}#{${level}}\\s+\\S`).test(l)),
  next: () => `${'#'.repeat(level)} `
});
const quoteRule = {
  prefix: (l) => (l.match(/^\s*>\s?/) || [''])[0],
  all: (ls) => ls.every((l) => /^\s*>/.test(l)),
  next: () => '> '
};
const LIST_PREFIX = /^\s*(?:[-*+]|\d+[.)])\s+/;
const bulletRule = {
  prefix: (l) => (l.match(LIST_PREFIX) || [''])[0],
  all: (ls) => ls.every((l) => /^\s*[-*+]\s+/.test(l)),
  next: () => '- '
};
const numberRule = {
  prefix: (l) => (l.match(LIST_PREFIX) || [''])[0],
  all: (ls) => ls.every((l) => /^\s*\d+[.)]\s+/.test(l)),
  next: (i) => `${i + 1}. `
};

function editLines(value, s, e, rule, placeholder) {
  const from = value.lastIndexOf('\n', s - 1) + 1;
  let endAt = e;
  if (e > s && value[e - 1] === '\n') endAt = e - 1; // a selection ending at a line start does not include that line
  let to = value.indexOf('\n', Math.max(endAt, from));
  if (to < 0) to = value.length;
  const lines = value.slice(from, to).split('\n');
  const filled = lines.filter((l) => l.trim());

  if (!filled.length) {
    if (lines.length > 1) return null;
    const marker = rule.next(0);
    return { from, to, text: marker + placeholder, selStart: from + marker.length, selEnd: from + marker.length + placeholder.length };
  }

  const remove = rule.all(filled);
  let k = 0;
  const parts = lines.map((line) => {
    if (!line.trim()) return { line, oldLen: 0, newLen: 0 };
    const old = rule.prefix(line);
    const marker = remove ? '' : rule.next(k++);
    return { line: marker + line.slice(old.length), oldLen: old.length, newLen: marker.length };
  });
  const text = parts.map((p) => p.line).join('\n');

  // Map an old position to the new text, keeping it on the same character of the line's content.
  const map = (pos) => {
    let oldStart = from, newStart = from;
    for (let i = 0; i < lines.length; i++) {
      const oldEnd = oldStart + lines[i].length;
      if (pos <= oldEnd || i === lines.length - 1) {
        const col = pos - oldStart, p = parts[i];
        return newStart + (col < p.oldLen ? p.newLen : col - p.oldLen + p.newLen);
      }
      oldStart = oldEnd + 1; newStart += parts[i].line.length + 1;
    }
    return newStart;
  };
  return { from, to, text, selStart: map(s), selEnd: map(Math.max(s, e)) };
}

// ---------- horizontal rule ----------

function insertRule(value, at) {
  // After the current line, as its own paragraph (a "---" straight under text would become a heading).
  let pos = value.indexOf('\n', at);
  if (pos < 0) pos = value.length;
  if (at === value.lastIndexOf('\n', at - 1) + 1 && !value.slice(at, pos).trim()) pos = at; // on an empty line: right here
  const before = value.slice(0, pos), after = value.slice(pos);
  const lead = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = !after ? '\n\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const text = `${lead}---${trail}`;
  return { from: pos, to: pos, text, selStart: pos + text.length, selEnd: pos + text.length };
}

/** Applies an edit to a string (the editor applies the same edit to the textarea in place). */
export const applyEdit = (value, edit) => value.slice(0, edit.from) + edit.text + value.slice(edit.to);

/** Smallest span that actually changes, so the editor rewrites as little of the textarea as possible. */
export function narrowEdit(value, edit) {
  let { from, to, text } = edit;
  while (from < to && text.length && value[from] === text[0]) { from++; text = text.slice(1); }
  while (to > from && text.length && value[to - 1] === text[text.length - 1]) { to--; text = text.slice(0, -1); }
  return { ...edit, from, to, text };
}
