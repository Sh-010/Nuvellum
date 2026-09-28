import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter, contentPolicyErrors } from '../scripts/lib/editorial.mjs';
import { newStoryQualityProblems, sourceHash, branchName } from '../scripts/lib/newsroom.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workflow = JSON.parse(readFileSync(join(root, 'n8n', 'workflows', 'nuvellum-newsroom.json'), 'utf8'));

const node = (name) => {
  const found = workflow.nodes.find(n => n.name === name);
  assert.ok(found, `missing n8n node: ${name}`);
  return found;
};

test('canonical newsroom stays inactive during stabilization', () => {
  assert.equal(workflow.active, false);
});

test('draft contract explicitly requests regions and countries', () => {
  const prompt = node('Gemini Draft Article').parameters.messages.values[0].content;
  assert.match(prompt, /"regions":\[/);
  assert.match(prompt, /"countries":\[/);
  assert.match(prompt, /middle-east-north-africa/);
  assert.match(prompt, /Use \[\] when geography is not material/);
  assert.match(prompt, /United States \(not US or USA\)/);
});

test('draft parser fails closed on missing geography and writes frontmatter arrays', () => {
  const code = node('Parse Draft & Build Markdown').parameters.jsCode;
  assert.match(code, /Draft is missing regions array/);
  assert.match(code, /Draft is missing countries array/);
  assert.match(code, /`regions: \$\{JSON\.stringify\(regions\)\}`/);
  assert.match(code, /`countries: \$\{JSON\.stringify\(countries\)\}`/);
  assert.match(code, /regions,countries,image/);
});

test('final GitHub payload gate re-checks geography before commit', () => {
  const code = node('Build GitHub Payload').parameters.jsCode;
  assert.match(code, /regions frontmatter does not match article metadata/);
  assert.match(code, /countries frontmatter does not match article metadata/);
  assert.match(code, /allowedRegions=new Set/);
});

// ---- Execution: run the candidate's real Code nodes (per-item mode) on fixtures, not regexes.
function runNode(name, $json, store) {
  const $ = ref => { assert.ok(ref in store, `node ${name} reads missing item ${ref}`); return { item: { json: store[ref] }, first: () => ({ json: store[ref] }) }; };
  const fn = new Function('$json', '$input', '$', 'Buffer', node(name).parameters.jsCode);
  const out = fn($json, { item: { json: $json }, first: () => ({ json: $json }), all: () => [{ json: $json }] }, $, Buffer);
  return (store[name] = Array.isArray(out) ? out[0].json : out.json);
}
const gemini = value => ({ content: { parts: [{ text: typeof value === 'string' ? value : JSON.stringify(value) }] } });
const sourceText = ('Officials in Cairo said on Tuesday that talks on the ceasefire would resume, according to the ministry. '
  + 'The foreign minister told reporters the delegation would travel on Thursday. Negotiators said several issues remained open. ').repeat(9);
const SOURCE = { sourceLink: 'https://www.bbc.co.uk/news/articles/c1234567890o?at_medium=RSS', sourceName: 'BBC', sourceTitle: 'Egypt says ceasefire talks will resume',
  sourceText: sourceText + sourceText, sourcePublishedAt: '2026-09-28T09:00:00Z', publishedAt: '2026-09-28T09:00:00Z', pubDate: '2026-09-28T09:00:00Z' };
const DRAFT = { title: 'Egypt says ceasefire talks will resume on Thursday', dek: 'Cairo said negotiators would travel this week.', section: 'World', type: 'News',
  tags: ['Egypt', 'Diplomacy'], bodyMarkdown: sourceText, regions: ['middle-east-north-africa'], countries: ['Egypt'] };
function runChain(draft, { sensitive = false } = {}) {
  const store = { 'Prepare Source': SOURCE };
  const parsed = runNode('Parse Draft & Build Markdown', gemini(draft), store);
  if (parsed.draftFailed) return { failedClosed: parsed.draftError };
  runNode('Parse Editorial Review', gemini({ approved: true, risk_score: 5, issues: [], sensitive, decision_reason: 'clean' }), store);
  if (sensitive) runNode('Parse Sensitive Verification', gemini({ publishable: true, risk_score: 3, issues: [] }), store);
  runNode('Sanitize Editorial SVG', gemini('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#222"/></svg>'), store);
  const payload = runNode('Build GitHub Payload', { object: { sha: 'a'.repeat(40) } }, store);
  const markdown = Buffer.from(payload.contentBase64, 'base64').toString('utf8');
  return { payload, markdown, fm: parseFrontmatter(markdown) };
}

test('execution: geography survives review, verification and SVG nodes into the committed file', () => {
  for (const sensitive of [false, true]) {
    const r = runChain({ ...DRAFT, ...(sensitive ? { risk: 'sensitive', countries: ['Egypt', 'Israel'] } : {}) }, { sensitive });
    assert.deepEqual(r.fm.regions, ['middle-east-north-africa']);
    assert.deepEqual(r.fm.countries, sensitive ? ['Egypt', 'Israel'] : ['Egypt']);
    assert.equal(r.fm.status, 'published');
    assert.deepEqual(contentPolicyErrors(r.fm, r.payload.slug), []);
    assert.deepEqual(newStoryQualityProblems(r.fm, r.markdown.split('\n---').slice(1).join('\n---'), { slug: r.payload.slug, branch: r.payload.branchName, hasAiArt: !!r.payload.aiImageReady }), []);
  }
});

test('execution: explicit empty geography passes; missing or unknown geography fails closed', () => {
  const empty = runChain({ ...DRAFT, regions: [], countries: [] });
  assert.deepEqual([empty.fm.regions, empty.fm.countries], [[], []]);
  assert.match(runChain({ ...DRAFT, regions: undefined }).failedClosed, /missing regions array/);
  assert.match(runChain({ ...DRAFT, countries: undefined }).failedClosed, /missing countries array/);
  assert.match(runChain({ ...DRAFT, regions: ['middle-east'] }).failedClosed, /unsupported region/);
});

test('live branch identity equals the repository helper (hash and 60-character slug cut)', () => {
  const code = node('Build GitHub Payload').parameters.jsCode;
  const live = new Function(`${code.slice(0, code.indexOf('const article='))}; return { sourceHash };`)();
  for (const url of ['https://www.bbc.co.uk/news/articles/cr86xn04gxj9o?at_medium=RSS', 'http://BBC.co.uk/news/articles/cr86xn04gxj9o/', 'https://example.com/a/b?id=1#x',
    'https://example.com:8443/path/', 'https://www.aljazeera.com/news/2026/9/28/story', 'not a url'])
    assert.equal(sourceHash(url), live.sourceHash(url), url);
  const r = runChain({ ...DRAFT, title: 'Egypt says the long-awaited regional ceasefire talks will finally resume in Cairo on Thursday' });
  assert.equal(r.payload.branchName, branchName(r.payload.slug, SOURCE.sourceLink));
});

// ---- Live-only fixes (n8n versions c875619a, 081d8faa) must survive every geography sync.
test('live fixes survive: five-candidate queue, roundup/newsletter skip, multi-story rejection', () => {
  const queue = node('Queue Latest Candidates').parameters.jsCode;
  assert.match(queue, /const MAX_CANDIDATES = 5;/);
  assert.match(queue, /return selected\.slice\(0, MAX_CANDIDATES\);/);
  const draft = node('Gemini Draft Article').parameters.messages.values[0].content;
  assert.match(draft, /If the SOURCE is a roundup, newsletter, digest, deals post, gift guide or list/);
  assert.match(draft, /"skip":true,"reason":"roundup: <one line>"/);
  assert.match(draft, /Never combine separate stories into one article\./);
  assert.match(draft, /If the SOURCE ITSELF is an opinion column/);
  const review = node('Gemini Editorial Review').parameters.messages.values[0].content;
  assert.match(review, /approved=false if the article combines two or more separate stories/);
  assert.match(review, /roundup\/newsletter digest\)\. One story per article\./);
});

test('execution: queue selects up to five candidates across distinct outlets', () => {
  const hosts = ['bbc.co.uk', 'aljazeera.com', 'theverge.com', 'espn.com', 'nasa.gov', 'variety.com', 'ign.com', 'cnbc.com'];
  const items = hosts.map((h, i) => ({ json: { link: `https://www.${h}/news/story-${i}`, title: `Story ${i}`, isoDate: `2026-09-28T0${i}:00:00Z` } }));
  const fn = new Function('$input', node('Queue Latest Candidates').parameters.jsCode);
  const out = fn({ all: () => items });
  assert.equal(out.length, 5);
  assert.equal(new Set(out.map(x => x.json._sourceHost)).size, 5);
});

// ---- Canonical World Explorer countries: the live tables are exactly src/lib/countries.js.
test('live country tables equal the World Explorer resolver', async () => {
  const { COUNTRIES, countrySearchTerms, resolveCountry } = await import('../src/lib/countries.js');
  const parse = node('Parse Draft & Build Markdown').parameters.jsCode;
  const liveIndex = new Function(`${parse.split('\n').slice(1, 3).join('\n')}; return { COUNTRY_INDEX, normalizeCountry };`)();
  const expected = {};
  for (const c of COUNTRIES) for (const t of countrySearchTerms(c)) if (!(t in expected)) expected[t] = c.name;
  assert.deepEqual(Object.fromEntries(liveIndex.COUNTRY_INDEX), expected);
  for (const v of ['UK', 'Turkey', 'Türkiye', 'Dem. Rep. Congo', 'Côte d’Ivoire', 'U.S.', 'USA', 'Gaza', 'Bosnia'])
    assert.equal(liveIndex.COUNTRY_INDEX.get(liveIndex.normalizeCountry(v)) ?? null, resolveCountry(v)?.name ?? null, v);
  const payload = node('Build GitHub Payload').parameters.jsCode;
  const names = new Function(`${payload.match(/^const COUNTRY_NAMES=.*$/m)[0]}; return COUNTRY_NAMES;`)();
  assert.deepEqual([...names].sort(), [...new Set(COUNTRIES.map(c => c.name))].sort());
});

test('execution: country aliases are written in canonical form; unplaceable names fail closed', () => {
  const r = runChain({ ...DRAFT, countries: ['UK', 'Turkey', 'United Kingdom'], regions: ['europe-central-asia'] });
  assert.deepEqual(r.fm.countries, ['United Kingdom', 'Türkiye']);
  for (const bad of ['USA', 'Gaza', 'Bosnia', 'Atlantis'])
    assert.match(runChain({ ...DRAFT, countries: ['Egypt', bad] }).failedClosed, new RegExp(`site cannot place: ${bad}`));
});

test('execution: the pre-commit gate refuses geography that bypassed the draft parser', () => {
  const store = { 'Prepare Source': SOURCE };
  runNode('Parse Draft & Build Markdown', gemini(DRAFT), store);
  runNode('Parse Editorial Review', gemini({ approved: true, risk_score: 5, issues: [], sensitive: false, decision_reason: 'clean' }), store);
  runNode('Sanitize Editorial SVG', gemini('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'), store);
  const good = store['Sanitize Editorial SVG'];
  const attempt = patch => { store['Sanitize Editorial SVG'] = { ...good, ...patch }; return () => runNode('Build GitHub Payload', { object: { sha: 'a'.repeat(40) } }, store); };
  assert.throws(attempt({ countries: ['USA'], markdown: good.markdown.replace('countries: ["Egypt"]', 'countries: ["USA"]') }), /cannot place: USA/);
  assert.throws(attempt({ countries: ['Egypt'], markdown: good.markdown.replace('countries: ["Egypt"]', 'countries: []') }), /countries frontmatter does not match/);
  assert.throws(attempt({ regions: undefined }), /regions is not an array/);
  assert.throws(attempt({ regions: ['east-asia', 'east-asia'] }), /regions metadata is invalid/);
  assert.doesNotThrow(attempt({}));
});

// Regression for execution 936: with no open GitHub PRs the open-PR fetch returned zero items, which
// stopped the candidate before its duplicate check and ended the one-by-one loop early.
test('an empty open-PR list keeps the candidate (and the loop) moving', () => {
  assert.equal(node('Get Open Editorial PRs').alwaysOutputData, true, 'Get Open Editorial PRs must always output an item');
  const context = { sourceLink: 'https://www.bbc.co.uk/sport/cricket/articles/ckddv8j94395o', sourceHash8: 'abcdef12', exactSourceMatch: false };
  const fn = new Function('$input', '$', node('Check Open PR Duplicates').parameters.jsCode);
  const $ = () => ({ item: { json: context } });
  // What n8n passes on with alwaysOutputData when GitHub answers [] : one empty item.
  const [out] = fn({ all: () => [{ json: {} }] }, $);
  assert.equal(out.json.exactSourceMatch, false);
  assert.equal(out.json.openPrExactSourceMatch, false);
  assert.equal(out.json.sourceLink, context.sourceLink);
});
