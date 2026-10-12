import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightArticle } from '../scripts/lib/editorial-preflight.mjs';
import { parseArticle } from '../scripts/lib/article-rules.mjs';
import { readingTime } from '../src/lib/reading-time.js';
const article=(title,section)=>`---\ntitle: ${JSON.stringify(title)}\nsection: ${JSON.stringify(section)}\norigin: "automation"\nrisk: "sensitive"\nstatus: "review"\nreadingTime: "2 min"\n---\n${'word '.repeat(50)}`;
test('preflight corrects cross-desk film/comic errors without changing clearance or prose',()=>{
 for(const [title,section,expected] of [['A film arrives on Netflix','Gaming','Film & TV'],['Star Trek comic reprint','Gaming','Culture'],['Director discusses new film','Technology','Film & TV'],['Anime returns this year','Gaming','Anime']]){
  const before=article(title,section),out=preflightArticle(before),{data,body}=parseArticle(out,'test');
  assert.equal(data.section,expected);assert.equal(data.status,'review');assert.equal(data.risk,'sensitive');assert.equal(body,parseArticle(before,'test').body);
 }
 assert.equal(parseArticle(preflightArticle(article('New game comes to iPhone','Gaming')),'test').data.section,'Gaming');
});
test('reading estimates reflect visible body length and ignore URLs and frontmatter',()=>{
 assert.equal(readingTime('word '.repeat(30)),'1 min');assert.equal(readingTime('word '.repeat(460)),'3 min');
 assert.equal(readingTime(`---\ntitle: ${'word '.repeat(600)}\n---\n[hello](https://example.com/${'word/'.repeat(1000)})`),'1 min');
});
