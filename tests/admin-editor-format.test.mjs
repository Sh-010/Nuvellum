import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORMAT_ACTIONS, applyEdit, formatMarkdown, isSafeLinkUrl, linkIntent, narrowEdit } from '../src/lib/markdown-format.js';
import { renderMarkdown } from '../scripts/lib/admin/render.mjs';
import { articleErrors, parseArticle } from '../scripts/lib/article-rules.mjs';

// Apply an action to "text with [selection]" and return "result with [selection]".
function fmt(marked, action, opts) {
  const start = marked.indexOf('['), end = marked.indexOf(']') - 1;
  const value = marked.replace('[', '').replace(']', '');
  const edit = formatMarkdown(value, start, end, action, opts);
  if (!edit) return null;
  const out = applyEdit(value, edit);
  return out.slice(0, edit.selStart) + '[' + out.slice(edit.selStart, edit.selEnd) + ']' + out.slice(edit.selEnd);
}
// Same, but the caret/selection is written with ‹ › so [ ] can appear in Markdown links.
function fmtL(marked, action, opts) {
  const start = marked.indexOf('‹'), end = marked.indexOf('›') - 1;
  const value = marked.replace('‹', '').replace('›', '');
  const edit = formatMarkdown(value, start, end, action, opts);
  if (!edit) return null;
  const out = applyEdit(value, edit);
  return out.slice(0, edit.selStart) + '‹' + out.slice(edit.selStart, edit.selEnd) + '›' + out.slice(edit.selEnd);
}

test('bold toggles: wrap, then unwrap whether or not the markers are selected', () => {
  assert.equal(fmt('Some [words] here', 'bold'), 'Some **[words]** here');
  assert.equal(fmt('Some **[words]** here', 'bold'), 'Some [words] here');
  assert.equal(fmt('Some [**words**] here', 'bold'), 'Some [words] here');
  assert.equal(fmt('Some __[words]__ here', 'bold'), 'Some [words] here', 'underscore bold is recognised too');
  assert.equal(fmt('Some [words ]here', 'bold'), 'Some **[words]** here', 'markers hug the words, not the spaces');
  assert.equal(fmt('Caret []here', 'bold'), 'Caret **[bold text]**here', 'no selection inserts a selected placeholder');
});

test('italic toggles and never confuses bold for italic', () => {
  assert.equal(fmt('a [b] c', 'italic'), 'a *[b]* c');
  assert.equal(fmt('a *[b]* c', 'italic'), 'a [b] c');
  assert.equal(fmt('a [*b*] c', 'italic'), 'a [b] c');
  assert.equal(fmt('a _[b]_ c', 'italic'), 'a [b] c');
  assert.equal(fmt('a **[b]** c', 'italic'), 'a ***[b]*** c', 'italic on bold adds italic, does not strip bold');
  assert.equal(fmt('a ***[b]*** c', 'italic'), 'a **[b]** c', 'bold italic -> bold');
  assert.equal(fmt('a ***[b]*** c', 'bold'), 'a *[b]* c', 'bold italic -> italic');
});

test('inline code toggles', () => {
  assert.equal(fmt('run [npm test] now', 'code'), 'run `[npm test]` now');
  assert.equal(fmt('run `[npm test]` now', 'code'), 'run [npm test] now');
});

test('H2 and H3 switch level cleanly and toggle off, never stacking #', () => {
  assert.equal(fmt('[Heading]', 'h2'), '## [Heading]');
  assert.equal(fmt('## [Heading]', 'h2'), '[Heading]');
  assert.equal(fmt('## [Heading]', 'h3'), '### [Heading]');
  assert.equal(fmt('### [Heading]', 'h2'), '## [Heading]');
  assert.equal(fmt('## ## [Heading]', 'h2').startsWith('## '), true);
  assert.equal(fmt('Para[]graph text', 'h2'), '## Para[]graph text', 'the caret stays on the same character');
  assert.equal(fmt('[]', 'h3'), '### [Subheading]', 'empty line gets a selected placeholder');
});

test('list buttons never duplicate markers and convert between list kinds', () => {
  assert.equal(fmt('[one\ntwo]', 'ul'), '- [one\n- two]');
  assert.equal(fmt('- [one\n- two]', 'ul'), '[one\ntwo]', 'pressing again removes the bullets');
  assert.equal(fmt('- one\n[two]', 'ul'), '- one\n- [two]');
  assert.equal(fmt('[one\n- two]', 'ul'), '- [one\n- two]', 'mixed lines: no "- - two"');
  assert.equal(fmt('[- one\n- two]', 'ol'), '1. [one\n2. two]', 'bullets become numbers, not "1. - one"');
  assert.equal(fmt('1. [one\n2. two]', 'ol'), '[one\ntwo]');
  assert.equal(fmt('1. [one\n2. two]', 'ul'), '- [one\n- two]');
  assert.equal(fmt('[a\n\nb]', 'ul'), '- [a\n\n- b]', 'blank lines stay blank');
});

test('quote does not stack > > >', () => {
  assert.equal(fmt('[said this]', 'quote'), '> [said this]');
  assert.equal(fmt('> [said this]', 'quote'), '[said this]');
  assert.equal(fmt('> first\n[second]', 'quote'), '> first\n> [second]');
  assert.equal(fmt('[> first\nsecond]', 'quote'), '> [first\n> second]');
});

test('line formats keep the same text selected across several lines', () => {
  const edit = formatMarkdown('alpha\nbeta\ngamma', 2, 9, 'ul');
  const out = applyEdit('alpha\nbeta\ngamma', edit);
  assert.equal(out, '- alpha\n- beta\ngamma', 'only the lines the selection touches change');
  assert.equal(out.slice(edit.selStart, edit.selEnd), 'pha\n- bet', 'same characters selected, markers included only between');
});

test('links: https only, toggle off, and hostile URLs rejected', () => {
  assert.equal(fmtL('see ‹the report› now', 'link', { url: 'https://example.org/a' }), 'see [‹the report›](https://example.org/a) now');
  assert.equal(linkIntent('see [the report](https://x.org) now', 5, 15), 'unlink');
  assert.equal(fmtL('see [‹the report›](https://x.org) now', 'link'), 'see ‹the report› now');
  assert.equal(fmtL('see ‹[the report](https://x.org)› now', 'link'), 'see ‹the report› now');
  for (const bad of ['javascript:alert(1)', 'http://x.org', 'data:text/html,hi', 'https://x.org/"><script>', 'https://a b', '']) {
    assert.equal(isSafeLinkUrl(bad), false, bad);
    assert.equal(formatMarkdown('text', 0, 4, 'link', { url: bad }), null, `no edit for ${bad}`);
  }
});

test('horizontal rule is its own paragraph (never a setext heading)', () => {
  const v = 'First paragraph.\nSecond line.';
  const e = formatMarkdown(v, 3, 3, 'hr');
  assert.equal(applyEdit(v, e), 'First paragraph.\n\n---\n\nSecond line.');
  const end = formatMarkdown('Last.', 5, 5, 'hr');
  assert.equal(applyEdit('Last.', end), 'Last.\n\n---\n\n');
  assert.match(renderMarkdown(applyEdit(v, e)).html, /<hr>/);
});

test('narrowEdit replaces only the characters that change', () => {
  const value = 'Some words here';
  const edit = formatMarkdown(value, 5, 10, 'bold');
  const n = narrowEdit(value, edit);
  assert.equal(applyEdit(value, n), applyEdit(value, edit));
  assert.ok(n.to - n.from <= edit.to - edit.from);
  const head = formatMarkdown('## Title', 3, 3, 'h3');
  const nh = narrowEdit('## Title', head);
  assert.deepEqual([nh.from, nh.to, nh.text], [2, 2, '#'], 'H2 -> H3 inserts a single #');
});

test('no action ever introduces raw HTML, and every result passes the article validator', () => {
  const body = 'Opening paragraph with a claim.\n\n## Heading\n\nMiddle paragraph, with detail.\n\n- a\n- b\n\n> quoted\n\nClosing line.';
  for (const action of FORMAT_ACTIONS) {
    for (const [s, e] of [[0, 7], [34, 34], [45, 60], [body.length - 5, body.length]]) {
      const edit = formatMarkdown(body, s, e, action, { url: 'https://example.org/source' });
      if (!edit) continue;
      const out = applyEdit(body, edit);
      assert.ok(!/<[a-z!/]/i.test(out), `${action} at ${s}-${e} introduced markup`);
      const src = `---\ntitle: "T"\ndek: "D"\nsection: "World"\ntype: "News"\nauthor: "A"\ndate: "2026-09-29"\nreadingTime: "1 min"\nstatus: "draft"\ntags: ["t"]\norigin: "manual"\nrisk: "low"\n---\n\n${out}\n`;
      parseArticle(src, 'x.md');
      const errs = articleErrors(src, 'x.md', { registry: new Map(), aiArtExists: () => true, publicFileExists: () => true })
        .filter((m) => /html|unsafe|link target|markup/i.test(m));
      assert.deepEqual(errs, [], `${action}: ${errs.join('; ')}`);
    }
  }
});

test('the editor applies edits in place, keeps the view, and binds only safe local shortcuts', () => {
  const page = readFileSync(new URL('../src/pages/admin.astro', import.meta.url), 'utf8');
  assert.match(page, /from '\.\.\/lib\/markdown-format\.js'/);
  for (const a of FORMAT_ACTIONS) assert.match(page, new RegExp(`data-md="${a}"`), `toolbar has ${a}`);
  assert.match(page, /data-hist="undo"/); assert.match(page, /data-hist="redo"/);
  assert.match(page, /execCommand\(text \? 'insertText' : 'delete'/, 'targeted in-place edit');
  assert.match(page, /setRangeText\(text, from, to/, 'setRangeText fallback');
  assert.doesNotMatch(page, /ta\.value = out/, 'no whole-value rewrite');
  assert.match(page, /addEventListener\('mousedown', \(ev\) => ev\.preventDefault\(\)\)/, 'toolbar does not steal the selection');
  assert.match(page, /focus\(\{ preventScroll: true \}\)/);
  assert.match(page, /bodyEl\.scrollTop = sel\.scrollTop/);
  assert.match(page, /window\.scrollTo\(win\.x, win\.y\)/);
  assert.match(page, /const SHORTCUTS = \{ b: 'bold', i: 'italic', k: 'link' \}/);
  assert.match(page, /if \(ev\.altKey \|\| ev\.shiftKey/, 'shortcuts leave Alt/Shift combinations to the browser');
  assert.match(page, /bodyEl\.addEventListener\('keydown'/, 'shortcuts are bound to the body only');
});
