import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVisualBrief,
  chooseVisualMode,
  licenseAllowed,
  normalizeLicense,
  visualCandidateProblems,
  editorialVisualScore,
  rankVisualCandidates,
  semanticVisualScore,
  selectBestVisual
} from '../scripts/visual/core.mjs';
import { normalizeCommonsPage } from '../scripts/visual/wikimedia.mjs';

test('license normalization and allowlist cover Commons-friendly licenses', () => {
  assert.equal(normalizeLicense('Creative Commons Attribution-ShareAlike 4.0'), 'cc by-sa 4.0');
  assert.equal(licenseAllowed('CC BY-SA 4.0'), true);
  assert.equal(licenseAllowed('Public domain'), true);
  assert.equal(licenseAllowed('CC BY-NC 4.0'), false);
});

test('visual policy prefers illustration for abstract analysis', () => {
  assert.equal(chooseVisualMode({
    title: 'AI infrastructure is reshaping digital sovereignty',
    section: 'Technology',
    type: 'Analysis',
    image: '/images/technology.svg',
    tags: ['AI','infrastructure']
  }), 'illustration');
});

test('visual policy marks materially geographic conflict visuals for review', () => {
  assert.equal(chooseVisualMode({
    title: 'Shipping disrupted near strategic strait',
    section: 'World',
    type: 'News',
    image: '/images/world.svg',
    countries: ['Egypt'],
    regions: ['middle-east-north-africa'],
    tags: ['shipping','strait']
  }), 'map-review');
});

test('brief never invents entities and carries article metadata', () => {
  const brief = buildVisualBrief({
    slug:'example',
    title:'A story in Cairo',
    dek:'Context.',
    section:'World',
    type:'News',
    risk:'low',
    countries:['Egypt'],
    regions:['middle-east-north-africa'],
    tags:['Cairo']
  });
  assert.deepEqual(brief.countries, ['Egypt']);
  assert.match(brief.photoQuery, /Egypt/);
});

test('Wikimedia candidate normalization retains attribution and license', () => {
  const c = normalizeCommonsPage({
    title:'File:Cairo.jpg',
    canonicalurl:'https://commons.wikimedia.org/wiki/File:Cairo.jpg',
    imageinfo:[{
      thumburl:'https://upload.wikimedia.org/example.jpg',
      url:'https://upload.wikimedia.org/original.jpg',
      thumbwidth:1600,
      thumbheight:900,
      mime:'image/jpeg',
      extmetadata:{
        Artist:{value:'Example Photographer'},
        LicenseShortName:{value:'CC BY-SA 4.0'},
        LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'}
      }
    }]
  });
  assert.equal(c.credit, 'Example Photographer');
  assert.equal(c.license, 'CC BY-SA 4.0');
  assert.deepEqual(visualCandidateProblems(c), []);
});

test('candidate QA rejects weak or unsafe candidates', () => {
  const p = visualCandidateProblems({
    provider:'wikimedia',
    title:'x',
    credit:'',
    license:'All rights reserved',
    url:'http://example.com/a.svg',
    sourcePage:'https://example.com',
    width:400,
    height:300
  });
  assert.ok(p.length >= 4);
});


test('editorial scoring prefers premium editorial composition over generic stock', () => {
  const brief = { mode:'photo', title:'Global trade tensions deepen', entities:['Europe'] };
  const premium = {
    title:'European Parliament at dusk',
    description:'Editorial photograph of institutional architecture under dramatic evening light.',
    width:2000,height:1200,mime:'image/jpeg'
  };
  const generic = {
    title:'Business handshake over laptop',
    description:'Generic stock photo.',
    width:2000,height:1200,mime:'image/jpeg'
  };
  assert.ok(editorialVisualScore(premium, brief) > editorialVisualScore(generic, brief));
  assert.equal(rankVisualCandidates([generic,premium], brief)[0].title, premium.title);
});


test('semantic relevance prevents beautiful unrelated imagery from winning', () => {
  const brief = { mode:'photo', title:'Swiss voters reject tighter neutrality rules', dek:'Referendum in Switzerland', entities:['Switzerland','referendum'] };
  const related = {
    title:'Federal Palace of Switzerland at night',
    description:'The parliament building in Bern, Switzerland.',
    width:2000,height:1200,mime:'image/jpeg',badges:['featured']
  };
  const unrelated = {
    title:'Dramatic museum interior at dusk',
    description:'Award-winning architectural photograph.',
    width:2400,height:1350,mime:'image/jpeg',badges:['featured','quality']
  };
  assert.ok(semanticVisualScore(related, brief) > semanticVisualScore(unrelated, brief));
  assert.equal(rankVisualCandidates([unrelated,related], brief)[0].title, related.title);
});

test('selector can decline weak candidates instead of forcing an image', () => {
  const brief = { mode:'photo', title:'Specific named event', entities:['SpecificSubject'] };
  const weak = {
    provider:'wikimedia',
    title:'Generic office',
    description:'Generic stock photo with laptop.',
    credit:'X',
    license:'CC BY 4.0',
    sourcePage:'https://commons.wikimedia.org/wiki/File:X.jpg',
    url:'https://upload.wikimedia.org/x.jpg',
    width:1400,height:900,mime:'image/jpeg'
  };
  const result = selectBestVisual([weak], brief, { minConfidence: 90 });
  assert.equal(result.best, null);
  assert.equal(result.needsReview, true);
});
