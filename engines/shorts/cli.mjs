#!/usr/bin/env node
import { loadStory } from '../shared/article.mjs';
import { makeShort } from './engine.mjs';

const argv=process.argv.slice(2);
const get=(name)=>{const i=argv.indexOf('--'+name);return i>=0?(argv[i+1]&&!argv[i+1].startsWith('--')?argv[i+1]:true):undefined;};
const slug=get('slug');
if(!slug){
  console.error('Usage: node shorts/cli.mjs --slug <article-slug> [--preview] [--no-render]');
  process.exit(1);
}
const preview=Boolean(get('preview'));
const story=loadStory(slug);
const report=await makeShort(story,{
  scale:preview?.5:1,
  fps:preview?15:30,
  render:!get('no-render'),
  outDir:typeof get('out')==='string'?get('out'):undefined,
  onProgress:(f,n)=>process.stdout.write('\rrendering '+Math.round(f/n*100)+'%')
});
process.stdout.write('\n');
console.log(JSON.stringify(report,null,2));
process.exit(report.status==='refused'?2:0);

