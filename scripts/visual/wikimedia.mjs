import { licenseAllowed, visualCandidateProblems, rankVisualCandidates } from './core.mjs';

const API='https://commons.wikimedia.org/w/api.php';
const UA='NuvellumVisualEngine/1.0 (https://nuvellum.vercel.app; automated open-licence image discovery)';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function stripHtml(value){return String(value||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();}
function pick(meta,key){const v=meta?.[key]?.value;return v==null?'':stripHtml(v);}
async function request(url,fetchImpl=fetch){
  for(let attempt=0;attempt<4;attempt++){
    let res;
    try{res=await fetchImpl(url,{headers:{'user-agent':UA},signal:AbortSignal.timeout(20000)});}
    catch(err){if(attempt===3)throw err;await sleep(800*(attempt+1));continue;}
    if(res.ok)return res;
    if(res.status!==429&&res.status<500)throw new Error(`Wikimedia API returned ${res.status}`);
    if(attempt===3)throw new Error(`Wikimedia API kept returning ${res.status}`);
    await sleep(1200*(attempt+1));
  }
}
export function normalizeCommonsPage(page){
  const info=Array.isArray(page?.imageinfo)?page.imageinfo[0]:null;
  if(!info)return null;
  const meta=info.extmetadata||{};
  const license=pick(meta,'LicenseShortName')||pick(meta,'UsageTerms');
  const credit=pick(meta,'Artist')||pick(meta,'Credit')||'Unknown creator';
  const sourcePage=page.canonicalurl||`https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title||'').replace(/ /g,'_'))}`;
  const categoryText=(page?.categories||[]).map(c=>String(c?.title||'')).join(' ').toLowerCase();
  const badges=[];
  if(/featured picture/.test(categoryText))badges.push('featured');
  if(/quality image/.test(categoryText))badges.push('quality');
  if(/valued image/.test(categoryText))badges.push('valued');
  return {provider:'wikimedia',title:String(page.title||'').replace(/^File:/,''),description:pick(meta,'ImageDescription'),badges,credit,license,licenseUrl:pick(meta,'LicenseUrl'),sourcePage,url:info.thumburl||info.url||'',originalUrl:info.url||'',width:Number(info.thumbwidth||info.width||0),height:Number(info.thumbheight||info.height||0),mime:info.mime||''};
}
export async function searchWikimedia(query,{limit=14,width=1600,brief=null,fetchImpl=fetch}={}){
  const q=String(query||'').trim();if(!q)return[];
  const params=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',gsrnamespace:'6',gsrsearch:q,gsrlimit:String(Math.max(1,Math.min(30,limit))),prop:'imageinfo|info|categories',inprop:'url',iiprop:'url|size|mime|extmetadata',iiurlwidth:String(width),cllimit:'max'});
  const res=await request(`${API}?${params}`,fetchImpl);
  const data=await res.json();
  const candidates=Object.values(data?.query?.pages||{}).map(normalizeCommonsPage).filter(Boolean).filter(c=>licenseAllowed(c.license)).map(c=>({...c,problems:visualCandidateProblems(c)})).filter(c=>c.problems.length===0);
  return rankVisualCandidates(candidates,brief||{mode:'photo',title:q,entities:[]});
}
