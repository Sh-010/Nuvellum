import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseVisualMode, hasRealVisual, licenseAllowed, selectBestVisual, visualCandidateProblems } from '../scripts/visual/core.mjs';
import { normalizeCommonsPage } from '../scripts/visual/wikimedia.mjs';
import { applyVisualMetadata, cleanDescription } from '../scripts/visual/acquire.mjs';

test('only open Commons-friendly licences are accepted',()=>{
  assert.equal(licenseAllowed('CC BY-SA 4.0'),true);
  assert.equal(licenseAllowed('Public domain'),true);
  assert.equal(licenseAllowed('CC BY-NC 4.0'),false);
});
test('opinion stays illustration-first; abstract analysis and ordinary news try real photos first',()=>{
  assert.equal(chooseVisualMode({title:'Why seriousness is fashionable',section:'Culture',type:'Opinion',image:'/generated/ai/x.svg'}),'illustration');
  assert.equal(chooseVisualMode({title:'AI infrastructure and digital sovereignty',section:'Technology',type:'Analysis',image:'/generated/ai/x.svg'}),'photo-or-illustration');
  assert.equal(chooseVisualMode({title:'Film festival opens in Zurich',section:'Film & TV',type:'News',image:'/generated/ai/x.svg'}),'photo');
});
test('Wikimedia normalization retains credit, source and licence',()=>{
  const c=normalizeCommonsPage({title:'File:Bern.jpg',canonicalurl:'https://commons.wikimedia.org/wiki/File:Bern.jpg',imageinfo:[{thumburl:'https://upload.wikimedia.org/x.jpg',url:'https://upload.wikimedia.org/orig.jpg',thumbwidth:1600,thumbheight:900,mime:'image/jpeg',extmetadata:{Artist:{value:'Example Photographer'},LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},ImageDescription:{value:'Federal Palace in Bern, Switzerland'}}}]});
  assert.equal(c.credit,'Example Photographer');
  assert.equal(c.license,'CC BY-SA 4.0');
  assert.deepEqual(visualCandidateProblems(c),[]);
});
test('automatic selector declines an attractive but irrelevant image',()=>{
  const brief={mode:'photo',title:'Swiss voters reject neutrality rules',dek:'A referendum in Switzerland',entities:['Switzerland','referendum']};
  const unrelated={provider:'wikimedia',title:'Museum interior at dusk',description:'Architecture in Lisbon',credit:'X',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',sourcePage:'https://commons.wikimedia.org/wiki/File:X.jpg',url:'https://upload.wikimedia.org/x.jpg',width:1600,height:900,mime:'image/jpeg'};
  assert.equal(selectBestVisual([unrelated],brief,{minConfidence:78,minSemantic:12}).best,null);
});
test('frontmatter writer records visual provenance without touching the story body',()=>{
  const src='---\ntitle: "Story"\nimage: "/generated/ai/story.svg"\nimageAlt: "Old"\nstatus: "published"\n---\n\nBody remains here.\n';
  const out=applyVisualMetadata(src,{image:'/uploads/articles/story.jpg',imageAlt:'Federal Palace in Bern',imageProvider:'wikimedia',imageKind:'photo',imageCaption:'File photo: Federal Palace in Bern',imageCredit:'A',imageLicense:'CC BY 4.0',imageLicenseUrl:'https://creativecommons.org/licenses/by/4.0/',imageSourcePage:'https://commons.wikimedia.org/wiki/File:X.jpg'});
  assert.match(out,/imageProvider: "wikimedia"/);
  assert.match(out,/image: "\/uploads\/articles\/story.jpg"/);
  assert.match(out,/Body remains here\./);
  assert.equal((out.match(/^image:/gm)||[]).length,1);
});
test('description cleaner removes filename noise',()=>{
  assert.equal(cleanDescription({title:'Federal_Palace-Bern.jpg',description:''}),'Federal Palace Bern');
});

test('house section plates and AI SVGs are fallbacks, so acquisition still looks for a real photo',()=>{
  assert.equal(hasRealVisual({image:'/uploads/house/world.svg'}),false);
  assert.equal(hasRealVisual({image:'/generated/ai/story.svg'}),false);
  assert.equal(hasRealVisual({image:'/uploads/articles/story.jpg'}),true);
  assert.equal(chooseVisualMode({title:'Flood kills dozens',section:'World',type:'News',image:'/uploads/house/world.svg'}),'photo');
});
