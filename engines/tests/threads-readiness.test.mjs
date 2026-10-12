import test from 'node:test';
import assert from 'node:assert/strict';
import {threads} from '../publish/adapters.mjs';
const env={THREADS_USER_ID:'user',THREADS_TOKEN:'secret-value'};
const copy={threads:{text:'A story'}};
const story={slug:'a-story',url:'https://www.nuvellum.news/article/a-story'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('Threads waits for FINISHED and checkpoints the container before a single publish',async()=>{
 const seen=[],saved=[];let polls=0;
 const result=await threads.post(story,{env,copy,wait:async()=>{},checkpoint:p=>saved.push(p),fetchImpl:async(url,init)=>{
  seen.push(url);
  if(url.endsWith('/threads'))return response({id:'container'});
  if(url.includes('?fields='))return response({status:++polls===1?'IN_PROGRESS':'FINISHED'});
  assert.equal(saved[0].containerId,'container');assert.match(init.body,/creation_id=container/);return response({id:'post'});
 }});
 assert.equal(result.remoteId,'post');assert.equal(polls,2);assert.equal(seen.filter(x=>x.endsWith('/threads_publish')).length,1);
});
test('Threads retry reuses a checkpoint and never republishes a PUBLISHED container',async()=>{
 const calls=[];const result=await threads.post(story,{env,copy,previous:{containerId:'same',containerCreatedAt:new Date().toISOString()},fetchImpl:async url=>{calls.push(url);return response({status:'PUBLISHED'});}});
 assert.equal(result.kind,'link');assert.equal(calls.length,1);assert.match(calls[0],/\/same\?/);
});
test('processing timeout is retryable, while an invalid status fails closed without publishing',async()=>{
 for(const status of ['IN_PROGRESS','UNKNOWN']){
  let published=false;
  await assert.rejects(()=>threads.post(story,{env,copy,wait:async()=>{},fetchImpl:async url=>{
   if(url.endsWith('/threads'))return response({id:'c'});
   if(url.endsWith('/threads_publish'))published=true;
   return response({status});
  }}),e=>e.retryable===(status==='IN_PROGRESS'));
  assert.equal(published,false);
 }
});
