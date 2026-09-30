import test from 'node:test';
import { writeFileSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { subjectCandidates, resolveEntity, representativeProblem, selectRepresentative, representativeCaption, findRepresentative, LEGAL_RE } from '../scripts/visual/representative.mjs';
import { normalizeCommonsPage } from '../scripts/visual/wikimedia.mjs';
import { visualCandidateProblems } from '../scripts/visual/core.mjs';
import { acquireForArticle } from '../scripts/visual/acquire.mjs';

// ---------- a fake Wikidata + Commons ----------
const ENTITIES = {
  Q22686: { label: 'Donald Trump', desc: 'President of the United States (2017–2021; since 2025)', p31: ['Q5'] },
  Q27947481: { label: 'Donald Trump', desc: 'American physician', p31: ['Q5'] },
  Q23548: { label: 'National Aeronautics and Space Administration', aliases: ['NASA'], desc: 'American space and aeronautics agency', p31: ['Q17505024'] },
  Q309751: { label: 'Nasa', desc: 'genus of plants', p31: ['Q16521'] },
  Q907311: { label: 'Netflix', desc: 'American subscription video on-demand streaming service', p31: ['Q4830453'] },
  Q63523678: { label: 'Netflix', desc: '2019 single by Lazza', p31: ['Q134556'] },
  Q2636040: { label: 'Icebreaker', desc: '1989 history book by Viktor Suvorov', p31: ['Q47461344'] },
  Q11660: { label: 'artificial intelligence', desc: 'intelligence of machines', p31: ['Q112057532'] },
  Q49115: { label: 'Cornell University', aliases: ['Cornell'], desc: 'private research university in Ithaca, New York', p31: ['Q902104'] },
  Q457608: { label: 'Brandon Sanderson', desc: 'American fantasy writer (born 1975)', p31: ['Q5'] }
};
const SEARCH = { 'Donald Trump': ['Q22686', 'Q27947481'], NASA: ['Q309751', 'Q23548'], Netflix: ['Q907311', 'Q63523678'], Icebreaker: ['Q2636040'], 'Artificial intelligence': ['Q11660'], 'Cornell University': ['Q49115'], 'Brandon Sanderson': ['Q457608'] };
const file = (title, over = {}) => ({ title: `File:${title}`, canonicalurl: `https://commons.wikimedia.org/wiki/File:${title.replace(/ /g, '_')}`, imageinfo: [{ thumburl: `https://thumb.wikimedia.org/x/1600px-${encodeURIComponent(title)}`, url: 'https://upload.wikimedia.org/x', width: over.width ?? 3000, height: over.height ?? 2000, thumbwidth: 1600, thumbheight: 1067, mime: 'image/jpeg', extmetadata: { Artist: { value: over.credit ?? 'Photographer' }, LicenseShortName: { value: over.license ?? 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' }, ImageDescription: { value: over.desc ?? '' } } }] });
const DEPICTS = {
  Q22686: [file('Donald Trump official portrait (cropped wide).jpg', { license: 'Public domain', credit: 'The White House', desc: 'Official portrait at the White House' }), file('President Trump Visits St. John\'s Episcopal Church (1).jpg', { license: 'Public domain' }), file('2025 Official portraits Trump-Vance.png', { desc: 'Official portraits of President Donald Trump (left) and VP JD Vance (right)' }), file('President Trump at the G20 (2).jpg', { desc: 'President Trump meets with President Xi' })],
  Q49115: [file('Cornell University - Student\'s room.jpg'), file('Cornell University 1920 graduation.jpg', { license: 'Public domain' }), file('Cornell University - Helen Newman Hall.jpg', { license: 'CC BY 4.0' }), file('Cornell University police car.jpg')],
  Q23548: [file('NASA HQ Building.jpg', { license: 'Public domain' }), file('NASA and Samaritans Purse DC-8 aircrafts parked on the ramp in front of NASA Armstrong Flight Research Center Building 703.jpg', { license: 'Public domain' })],
  Q907311: [file('Netflix headquarters.jpg', { license: 'CC BY-SA 3.0' }), file('Original Netflix Logo.png', { license: 'Public domain' })],
  Q457608: [file('Brandon Sanderson at CONduit 2007.png', { license: 'CC BY 3.0', width: 1800, height: 1260 }), file('Steve Argyle and Brandon Sanderson.jpg')]
};
let calls = [];
async function fakeFetch(url) {
  calls.push(url);
  const u = new URL(url), q = u.searchParams;
  const json = (body) => new Response(JSON.stringify(body));
  if (u.hostname === 'www.wikidata.org' && q.get('action') === 'wbsearchentities') return json({ search: (SEARCH[q.get('search')] || []).map((id) => ({ id, label: ENTITIES[id].label, aliases: ENTITIES[id].aliases || [], description: ENTITIES[id].desc })) });
  if (u.hostname === 'www.wikidata.org' && q.get('action') === 'wbgetentities') {
    const entities = {};
    for (const id of q.get('ids').split('|')) {
      const e = ENTITIES[id];
      entities[id] = { id, labels: { en: { value: e.label } }, descriptions: { en: { value: e.desc } }, aliases: { en: (e.aliases || []).map((value) => ({ value })) }, claims: { P31: e.p31.map((v) => ({ mainsnak: { datavalue: { value: { id: v } } } })) } };
    }
    return json({ entities });
  }
  if (u.hostname === 'commons.wikimedia.org') {
    const s = q.get('gsrsearch') || '';
    const m = /haswbstatement:P180=(Q\d+)/.exec(s);
    const pages = m ? (DEPICTS[m[1]] || []) : [];
    return json({ query: { pages: Object.fromEntries(pages.map((p, i) => [i, p])) } });
  }
  throw new Error('unexpected ' + url);
}
const norm = (p) => ({ ...normalizeCommonsPage(p), via: 'depicts' });

test('subjects come from the headline first (a surname counts); generic tags are skipped', () => {
  assert.deepEqual(subjectCandidates({ title: 'Trump says AI companies sign voluntary accord', tags: ['Artificial intelligence', 'Donald Trump', 'USA', 'Tech', 'Anthropic'] }), ['Donald Trump', 'Artificial intelligence', 'Anthropic']);
  assert.deepEqual(subjectCandidates({ title: 'US prosecutors reopen case at Cornell University', tags: ['Cornell University', 'legal', 'investigation'] }), ['Cornell University']);
});

test('entities: exact names of real subjects only, disambiguated by the story', async () => {
  calls = [];
  const nasa = await resolveEntity('NASA', 'NASA awards orbital safety analysis contract space', { fetchImpl: fakeFetch });
  assert.equal(nasa.id, 'Q23548', 'the space agency, not the plant genus Nasa');
  assert.equal(nasa.kind, 'organisation');
  assert.equal((await resolveEntity('Netflix', "Netflix's Icebreaker adaptation streaming", { fetchImpl: fakeFetch })).id, 'Q907311', 'not the 2019 single');
  assert.equal(await resolveEntity('Icebreaker', 'Hannah Grace novel adaptation Netflix', { fetchImpl: fakeFetch }), null, 'a different book (by Viktor Suvorov) is not the subject');
  assert.equal(await resolveEntity('Artificial intelligence', 'AI safety accord', { fetchImpl: fakeFetch }), null, 'abstract concepts are never subjects');
  const trump = await resolveEntity('Donald Trump', 'Trump President United States AI', { fetchImpl: fakeFetch });
  assert.equal(trump.id, 'Q22686', 'the president, not the physician of the same name');
  assert.equal((await resolveEntity('Brandon Sanderson', 'magic systems in games', { fetchImpl: fakeFetch })).id, 'Q457608', 'a unique person name needs no overlap');
});

test('licence, size and host checks are unchanged and now judged on the ORIGINAL file', () => {
  const small = normalizeCommonsPage(file('Small.jpg', { width: 1000, height: 744 }));
  assert.equal(small.width, 1000, 'not the 1600px Commons reports for an unscaled thumbnail');
  assert.match(visualCandidateProblems(small).join(' '), /width 1000 is below 1200px/);
  const big = normalizeCommonsPage(file('Big.jpg'));
  assert.deepEqual(visualCandidateProblems(big), [], 'thumbnails on thumb.wikimedia.org are accepted');
  assert.match(visualCandidateProblems({ ...big, url: 'https://example.com/x.jpg' }).join(' '), /upload\.wikimedia\.org or thumb\.wikimedia\.org/);
  assert.match(visualCandidateProblems({ ...big, license: 'All rights reserved' }).join(' '), /license is not on the allowlist/);
  const entity = { id: 'Q49115', label: 'Cornell University', name: 'Cornell University', aliases: ['Cornell'], kind: 'institution', description: '' };
  assert.match(representativeProblem({ ...norm(file('Cornell University - Hall.jpg', { license: 'Non-commercial only' })) }, entity), /allowlist/);
});

test('people: shown on their own, no occasions, no meetings, never next to allegations', async () => {
  const trump = { id: 'Q22686', label: 'Donald Trump', name: 'Donald Trump', kind: 'person', description: 'President of the United States' };
  const cands = DEPICTS.Q22686.map(norm);
  const problems = Object.fromEntries(cands.map((c) => [c.title, representativeProblem(c, trump)]));
  assert.equal(problems['Donald Trump official portrait (cropped wide).jpg'], null);
  assert.match(problems["President Trump Visits St. John's Episcopal Church (1).jpg"], /occasion/);
  assert.match(problems['2025 Official portraits Trump-Vance.png'], /more than one person/);
  assert.match(problems['President Trump at the G20 (2).jpg'], /meeting/);
  assert.equal(selectRepresentative(cands, trump).best.title, 'Donald Trump official portrait (cropped wide).jpg');
  assert.ok(LEGAL_RE.test('US prosecutors reopen case of alleged gang rape at Cornell University'));
  const r = await findRepresentative({ title: 'Prosecutors charge aide to President Donald Trump', dek: 'An alleged scheme in the United States', tags: ['Donald Trump'], risk: 'sensitive' }, { fetchImpl: fakeFetch });
  assert.equal(r.outcome, 'none', 'legal story: no person imagery at all');
  assert.match(JSON.stringify(r.tried), /legal story: no person imagery/);
});

test('legal/sensitive institution stories: only buildings, grounds or views; never rooms, crowds or police', async () => {
  const r = await findRepresentative({ title: 'US prosecutors reopen case of alleged gang rape at Cornell University', dek: 'Prosecutors will reopen an inquiry.', tags: ['Cornell University', 'legal'], risk: 'sensitive', section: 'World' }, { fetchImpl: fakeFetch });
  assert.equal(r.outcome, 'selected');
  assert.equal(r.candidate.title, 'Cornell University - Helen Newman Hall.jpg');
  assert.equal(r.fallbackType, 'representative-institution');
  const entity = r.entity;
  for (const t of ["Cornell University - Student's room.jpg", 'Cornell University 1920 graduation.jpg', 'Cornell University police car.jpg']) {
    assert.ok(representativeProblem(norm(DEPICTS.Q49115.find((p) => p.title === `File:${t}`)), entity, { legal: true }), t);
  }
});

test('organisations and events: photographs of the subject before logos, never a person or another subject', () => {
  const nasa = { id: 'Q23548', label: 'National Aeronautics and Space Administration', name: 'NASA', aliases: ['NASA'], kind: 'organisation', description: 'space agency' };
  assert.equal(selectRepresentative(DEPICTS.Q23548.map(norm), nasa).best.title, 'NASA HQ Building.jpg');
  const netflix = { id: 'Q907311', label: 'Netflix', name: 'Netflix', kind: 'organisation', description: 'streaming service' };
  assert.equal(selectRepresentative(DEPICTS.Q907311.map(norm), netflix).best.title, 'Netflix headquarters.jpg');
  const cinemacon = { id: 'Q125405032', label: 'CinemaCon', name: 'CinemaCon', kind: 'event', description: 'trade show' };
  assert.match(representativeProblem(norm(file('Glen Powell at CinemaCon 2025 03.jpg')), cinemacon), /a photo of a person/);
  const picks = selectRepresentative([file('CinemaCon 2025 Archway to Meeting rooms.jpg'), file("CinemaCon 2025 Banners in Caesar's Palace.jpg"), file('Glen Powell at CinemaCon 2025 03.jpg')].map(norm), cinemacon);
  assert.equal(picks.best.title, "CinemaCon 2025 Banners in Caesar's Palace.jpg", 'official event signage first');
  assert.match(representativeProblem(norm(file('Some Unrelated Stadium.jpg')), cinemacon), /does not name the subject/, 'no generic imagery');
});

test('captions say whose image it is and that it is not of the events reported', () => {
  const c = representativeCaption('Official portrait at the White House.', { label: 'Donald Trump' });
  assert.equal(c, 'File photo: Official portrait at the White House. Image of Donald Trump, not of the events reported.');
  assert.match(c, /^File photo:/, 'still satisfies the automated-caption rule');
});

test('acquisition chain: story photo → representative → text-led, with contemporaneous story photos only', async (t) => {
  // A throwaway copy of a text-led story, so the test does not depend on the live article's image state.
  const path = 'tests/.tmp-rep-chain.md', disk = new URL('./.tmp-rep-chain.md', import.meta.url);
  writeFileSync(disk, `---
title: "Nasa awards orbital safety analysis support services contract"
dek: "The agency has awarded a five-year contract to Omitron Inc."
section: "Science"
type: "News"
date: "2026-09-29"
publishedAt: "2026-09-29T21:08:31.309Z"
status: "published"
tags: ["NASA","space safety","contracts"]
countries: ["United States"]
risk: "low"
---
NASA has awarded a contract.
`);
  t.after(() => rmSync(disk, { force: true }));
  const staleCeremony = { provider: 'wikimedia', title: 'NASA honors employees for flight safety (ssc-2010-00634).jpeg', description: 'NASA honors employees for flight safety', credit: 'NASA', license: 'Public domain', licenseUrl: 'https://en.wikipedia.org/wiki/Public_domain', sourcePage: 'https://commons.wikimedia.org/wiki/File:X.jpg', url: 'https://thumb.wikimedia.org/x.jpg', width: 3000, height: 2000, mime: 'image/jpeg' };
  const rep = { outcome: 'selected', fallbackType: 'representative-organisation', entity: { label: 'NASA', kind: 'organisation' }, candidate: { ...staleCeremony, title: 'NASA HQ Building.jpg', description: 'NASA headquarters' } };
  // A matching but years-old ceremony photo is not the story's own picture: the representative tier decides.
  let r = await acquireForArticle(path, { search: async () => [staleCeremony], representative: async () => rep });
  assert.equal(r.outcome, 'selected');
  assert.equal(r.fallbackType, 'representative-organisation');
  assert.equal(r.candidate.title, 'NASA HQ Building.jpg');
  // Nothing representative either → text-led (dry run reports "fallback").
  r = await acquireForArticle(path, { search: async () => [], representative: async () => ({ outcome: 'none', tried: [{ name: 'NASA', entity: 'x' }] }) });
  assert.equal(r.outcome, 'fallback');
  assert.equal(r.fallbackType, 'text-led');
  // A story that already has its own photo is left alone.
  r = await acquireForArticle('src/content/articles/roy-keane-and-wayne-rooney-clash-over-potential-man-city-title-strips.md', { search: async () => { throw new Error('must not search'); } });
  assert.equal(r.outcome, 'already-acquired');
});

test('representative captions never borrow a description about an unnamed "he" or "she"', async () => {
  const { cleanDescription } = await import('../scripts/visual/acquire.mjs');
  const c = { title: "CinemaCon 2025 Banners in Caesar's Palace.jpg", description: 'Banners at CinemaCon 2025 where he was honored with the Star of the Year award' };
  assert.equal(cleanDescription(c, { representative: true }), "CinemaCon 2025 Banners in Caesar's Palace");
  assert.match(cleanDescription(c), /where he was honored/, 'story photos keep their own description');
});

test('licence URLs Commons still reports as http:// on HTTPS-only hosts are upgraded, others left for validation', () => {
  const page = file('Netflix headquarters.jpg');
  page.imageinfo[0].extmetadata.LicenseUrl.value = 'http://creativecommons.org/licenses/by-sa/3.0/';
  assert.equal(normalizeCommonsPage(page).licenseUrl, 'https://creativecommons.org/licenses/by-sa/3.0/');
  page.imageinfo[0].extmetadata.LicenseUrl.value = 'http://example.org/licence';
  assert.equal(normalizeCommonsPage(page).licenseUrl, 'http://example.org/licence');
});
