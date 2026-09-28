import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStory } from '../shared/article.mjs';
import { extractiveScript, scriptSeconds, verifyScript } from '../shorts/script.mjs';
import { buildPlan, toSrt } from '../shorts/plan.mjs';
import { makeShort } from '../shorts/engine.mjs';
import { frameHtml } from '../shorts/template.mjs';

const story=loadStory('pokemon-tcg-s-next-big-set-available-weeks-before-official-release');

test('extractive short uses only verbatim article sentences and stays bounded',()=>{
  const script=extractiveScript(story);
  assert.deepEqual(verifyScript(script,story),[]);
  assert.equal(script.method,'extractive');
  assert.ok(script.lines.some(x=>x.role==='hook'));
  assert.ok(scriptSeconds(script)<=45.01);
  for(const line of script.lines.filter(x=>x.role!=='cta')) assert.equal(line.text.replace(/\s+/g,' ').trim(),story.sentences[line.source].replace(/\s+/g,' ').trim());
});

test('plan is vertical, timed and emits captions',()=>{
  const script=extractiveScript(story);
  const narrated={roles:script.lines.map(x=>x.role),lines:script.lines.map(x=>({text:x.text,file:null,seconds:Math.max(1,x.text.split(/\s+/).length/2.55)}))};
  const plan=buildPlan(story,narrated,{fps:15});
  assert.equal(plan.width,1080);
  assert.equal(plan.height,1920);
  assert.ok(plan.total>=20&&plan.total<=45);
  assert.match(toSrt(plan),/--> /);
  const html=frameHtml(plan,{});
  assert.match(html,/NUVELLUM/);
  assert.match(html,/no-art/);
  assert.ok(!html.includes('BBC'));
});

test('engine can produce a complete zero-cost plan without rendering or external services',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nuvellum-short-'));
  try{
    const report=await makeShort(story,{outDir:dir,render:false,env:{NUVELLUM_TTS:'silent'},fps:15});
    assert.equal(report.status,'planned');
    assert.equal(report.tts,'silent');
    assert.ok(report.seconds>=20&&report.seconds<=45);
    assert.match(readFileSync(join(dir,'captions.srt'),'utf8'),/--> /);
    assert.equal(JSON.parse(readFileSync(join(dir,'script.json'),'utf8')).method,'extractive');
  }finally{rmSync(dir,{recursive:true,force:true});}
});


// Regressions from the pre-connection QA pass (renders of main @ 58adf50).
import { sentences } from '../shared/article.mjs';
import { readdirSync } from 'node:fs';

test('sentences never break inside numbers, prices, initials or abbreviations', () => {
  assert.deepEqual(sentences('A jury ordered Apple to pay more than $5.7bn for infringing two patents. Anthropic released Sonnet 5.5, its newest model today. The film’s U.S. distributor has appealed the ruling. It stars “Magnum P.I.” actor Tom Selleck in the lead. Prices reached 238.9p a litre this week.'), [
    'A jury ordered Apple to pay more than $5.7bn for infringing two patents.',
    'Anthropic released Sonnet 5.5, its newest model today.',
    'The film’s U.S. distributor has appealed the ruling.',
    'It stars “Magnum P.I.” actor Tom Selleck in the lead.',
    'Prices reached 238.9p a litre this week.'
  ]);
  assert.deepEqual(sentences('Dr. Smith told reporters on Tuesday that talks would resume. Officials agreed.'), ['Dr. Smith told reporters on Tuesday that talks would resume.']);
});

test('no published story yields a sentence fragment that starts mid-sentence', () => {
  let n = 0;
  for (const f of readdirSync(new URL('../../src/content/articles/', import.meta.url))) {
    let s; try { s = loadStory(f.replace(/\.md$/, '')); } catch { continue; }
    n++;
    for (const x of s.sentences) assert.ok(!/^[a-z,;:]|^\d+[a-z]/.test(x), `${s.slug}: "${x.slice(0, 60)}"`);
  }
  assert.ok(n >= 30);
  const apple = extractiveScript(loadStory('apple-ordered-to-pay-5-7bn-in-patent-infringement-case'));
  assert.ok(apple.lines.every(l => !/\$5\.$/.test(l.text) && !/^7bn/.test(l.text)), JSON.stringify(apple.lines.map(l => l.text)));
});

test('artwork sits on the ivory ground and photos carry the FILE PHOTO label', () => {
  const script = extractiveScript(story);
  const narrated = { roles: script.lines.map(x => x.role), lines: script.lines.map(x => ({ text: x.text, file: null, seconds: 3 })) };
  const plan = buildPlan({ ...story, imageKind: 'photo' }, narrated, { fps: 15 });
  const photo = frameHtml(plan, { imageDataUri: 'data:image/jpeg;base64,AA==' });
  assert.match(photo, /FILE PHOTO/);
  assert.match(photo, /\.art\{[^}]*background:#F2EDE3/i);
  const ill = frameHtml(buildPlan({ ...story, imageKind: 'illustration' }, narrated, { fps: 15 }), { imageDataUri: 'data:image/svg+xml;base64,AA==' });
  assert.match(ill, /ILLUSTRATION/);
  assert.ok(!ill.includes('FILE PHOTO'));
});
