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

