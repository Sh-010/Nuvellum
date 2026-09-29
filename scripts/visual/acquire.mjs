#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../lib/editorial.mjs';
import { buildVisualBrief, chooseVisualMode, selectBestVisual } from './core.mjs';
import { searchWikimedia } from './wikimedia.mjs';

const root=dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const UA='NuvellumVisualEngine/1.0 (https://nuvellum.vercel.app)';

export function cleanDescription(candidate){
  const d=String(candidate?.description||'').replace(/\s+/g,' ').trim();
  if(d.length>=18&&d.length<=220)return d.replace(/[.\s]+$/,'');
  return String(candidate?.title||'Editorial photograph').replace(/\.[A-Za-z0-9]{2,5}$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
}
export function applyVisualMetadata(src,fields){
  if(!String(src).startsWith('---'))throw new Error('article is missing frontmatter');
  const end=src.indexOf('\n---',3);if(end<0)throw new Error('article frontmatter is not closed');
  let lines=src.slice(4,end).split(/\r?\n/);
  const keys=new Set(Object.keys(fields));
  lines=lines.filter(line=>{const m=line.match(/^([A-Za-z][A-Za-z0-9]*):/);return !m||!keys.has(m[1]);});
  const imageAltIndex=lines.findIndex(l=>/^imageAlt:/.test(l));
  const anchor=imageAltIndex>=0?imageAltIndex+1:lines.length;
  const inserted=Object.entries(fields).map(([k,v])=>`${k}: ${JSON.stringify(String(v??''))}`);
  lines.splice(anchor,0,...inserted);
  return `---\n${lines.join('\n')}\n---${src.slice(end+4)}`;
}

const VISUAL_KEYS=new Set(['image','imageAlt','imageProvider','imageKind','imageCaption','imageCredit','imageLicense','imageLicenseUrl','imageSourcePage','imageGenerationMode']);
export function removeVisualMetadata(src){
  if(!String(src).startsWith('---'))throw new Error('article is missing frontmatter');
  const end=src.indexOf('\n---',3);if(end<0)throw new Error('article frontmatter is not closed');
  const lines=src.slice(4,end).split(/\r?\n/).filter(line=>{
    const m=line.match(/^([A-Za-z][A-Za-z0-9]*):/);
    return !m||!VISUAL_KEYS.has(m[1]);
  });
  return `---\n${lines.join('\n')}\n---${src.slice(end+4)}`;
}
function queries(article,brief){
  const countries=(article.countries||[]).slice(0,2).join(' ');
  const tags=(article.tags||[]).slice(0,3).join(' ');
  const title=String(article.title||'').replace(/[“”"'’]/g,' ').replace(/\s+/g,' ').trim();
  return [...new Set([brief.photoQuery,`${countries} ${tags}`.trim(),title].filter(q=>q&&q.length>=4))];
}
async function download(url){
  const res=await fetch(url,{headers:{'user-agent':UA},signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw new Error(`image download returned ${res.status}`);
  const type=(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!/^image\/(jpeg|png|webp)$/.test(type))throw new Error(`unexpected image type ${type||'unknown'}`);
  return {bytes:Buffer.from(await res.arrayBuffer()),mime:type};
}
function extension(mime,url){
  if(mime==='image/png')return'png';
  if(mime==='image/webp')return'webp';
  const e=extname(new URL(url).pathname).toLowerCase();
  return e==='.png'?'png':e==='.webp'?'webp':'jpg';
}
export async function acquireForArticle(path,{doApply=false,search=searchWikimedia}={}){
  const abs=join(root,path);const src=readFileSync(abs,'utf8');const data=parseFrontmatter(src)||{};
  const slug=basename(path).replace(/\.md$/,'');data.slug=slug;
  if(data.imageProvider==='wikimedia'||new RegExp(`^/uploads/articles/${slug}\\.(?:jpe?g|png|webp)$`,'i').test(String(data.image||'')))return{outcome:'already-acquired',slug};
  const mode=chooseVisualMode(data);
  if(mode==='existing')return{outcome:'existing-real-visual',slug};
  if(mode==='illustration'||mode==='map-review')return{outcome:'keep-illustration',slug,mode};
  const brief=buildVisualBrief(data);
  const seen=new Map();
  for(const q of queries(data,brief)){
    try{for(const c of await search(q,{brief,limit:16,width:1600}))if(!seen.has(c.sourcePage))seen.set(c.sourcePage,c);}
    catch(err){console.warn(`visual search failed for "${q.slice(0,80)}": ${err.message}`);}
  }
  const strict=data.risk==='sensitive';
  const pick=selectBestVisual([...seen.values()],brief,{minConfidence:strict?86:78,minSemantic:strict?18:12});
  if(!pick.best){
    // For ordinary news, a failed photo search means intentional text-led presentation, not generic AI art.
    // Illustration remains a fallback only for analysis/abstract pieces explicitly classified photo-or-illustration.
    if(mode==='photo'&&doApply){
      const image=String(data.image||'');
      if(/^\/generated\/ai\/.+\.svg$/i.test(image)||/^\/uploads\/house\/[a-z-]+\.svg$/i.test(image)){
        writeFileSync(abs,removeVisualMetadata(src));
        const ai=join(root,'public','generated','ai',`${slug}.svg`);
        if(existsSync(ai))rmSync(ai);
        return{outcome:'text-led',slug,mode,candidates:pick.ranked.slice(0,5)};
      }
    }
    return{outcome:'fallback',slug,mode,candidates:pick.ranked.slice(0,5)};
  }
  const candidate=pick.best;
  if(!doApply)return{outcome:'selected',slug,mode,candidate};
  const dl=await download(candidate.url);
  const ext=extension(dl.mime,candidate.url);
  const publicPath=`/uploads/articles/${slug}.${ext}`;
  const disk=join(root,'public',publicPath);
  mkdirSync(dirname(disk),{recursive:true});writeFileSync(disk,dl.bytes);
  const desc=cleanDescription(candidate);
  const fields={image:publicPath,imageAlt:desc.slice(0,220),imageProvider:'wikimedia',imageKind:'photo',imageCaption:`File photo: ${desc}`.slice(0,280),imageCredit:candidate.credit,imageLicense:candidate.license,imageLicenseUrl:candidate.licenseUrl||candidate.sourcePage,imageSourcePage:candidate.sourcePage};
  writeFileSync(abs,applyVisualMetadata(src,fields));
  const ai=join(root,'public','generated','ai',`${slug}.svg`);
  if(existsSync(ai))rmSync(ai);
  return{outcome:'applied',slug,mode,path:publicPath,candidate:{title:candidate.title,credit:candidate.credit,license:candidate.license,sourcePage:candidate.sourcePage,selectionConfidence:candidate.selectionConfidence,semanticScore:candidate.semanticScore}};
}
async function main(){
  const args=process.argv.slice(2),doApply=args.includes('--apply'),articlePath=args.find(x=>!x.startsWith('--'));
  if(!articlePath){console.error('Usage: node scripts/visual/acquire.mjs [--apply] src/content/articles/<slug>.md');process.exit(2);}
  console.log(JSON.stringify(await acquireForArticle(articlePath,{doApply}),null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main().catch(err=>{console.error(err.stack||err.message);process.exit(1);});
