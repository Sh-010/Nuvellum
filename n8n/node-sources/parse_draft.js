
function textOf(data){
  const c=[data?.content?.parts?.[0]?.text,data?.candidates?.[0]?.content?.parts?.[0]?.text,
    Array.isArray(data?.content)?data.content.find(x=>x?.type==='text')?.text:undefined,
    data?.text,typeof data?.content==='string'?data.content:undefined];
  return c.find(x=>typeof x==='string'&&x.trim())||'';
}
function jsonOf(text){
  let s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  const a=s.indexOf('{'),b=s.lastIndexOf('}');
  if(a>=0&&b>a)s=s.slice(a,b+1);
  return JSON.parse(s);
}

const source=$('Prepare Source').item.json;
const allowedSections=new Set(['World','Business','Technology','Science','Crime','Sports','Culture','Film & TV','Anime','Gaming']);
const allowedTypes=new Set(['News','Analysis','Explainer']);
function slugify(s){return String(s).toLowerCase().normalize('NFKD').replace(/[^\x00-\x7F]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90).replace(/-+$/,'');}
function words(s){return String(s||'').trim().split(/\s+/).filter(Boolean).length;}
// The repo's frontmatter parser strips the outer quotes only, so inner ASCII quotes would render as \".
function yaml(v){return JSON.stringify(String(v??'').replace(/[<>]/g,'').replace(/"([^"]*)"/g,'“$1”').replace(/"/g,'”'));}

// Nuvellum headlines are sentence case. Models tend to return Title Case, so lower-case any
// capitalised word that running text uses mostly in lower case (proper nouns survive).
const FUNCTION_WORDS=new Set(['a','an','the','and','or','but','nor','of','in','on','at','to','for','with','as','by','from','after','before','over','under','into','onto','amid','about','against','between','during','without','within','than','is','are','was','were','be','been','its','their','his','her','new','says','say','said']);
function sentenceCase(title, reference){
  const tokens=String(title).split(/(\s+)/);
  const wordsOnly=tokens.filter(t=>/\S/.test(t));
  const capped=wordsOnly.slice(1).filter(w=>/^[A-Z][a-z]/.test(w)).length;
  if(wordsOnly.length<4 || capped < Math.ceil((wordsOnly.length-1)*0.6)) return title;
  // Headings are often Title Case too, so only running prose counts as evidence.
  const prose=' '+String(reference||'').split('\n').filter(l=>!/^\s*#/.test(l)).join(' ').replace(/\s+/g,' ')+' ';
  const count=(re)=>(prose.match(re)||[]).length;
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  let first=true;
  return tokens.map(t=>{
    if(!/\S/.test(t)) return t;
    if(first){ first=false; return t; }
    const m=t.match(/^([^A-Za-z]*)([A-Z][a-z'’\-]+)([^A-Za-z]*)$/);
    if(!m) return t;
    const lower=m[2].toLowerCase();
    const lowerUses=count(new RegExp('[\\s("“]'+esc(lower)+'(?=[\\s,.;:!?)"”])','g'));
    const cappedMidSentence=count(new RegExp('[a-z0-9,;]\\s'+esc(m[2])+'(?=[\\s,.;:!?)"”\'’])','g'));
    // Any capitalised use mid-sentence means a proper noun: leave it alone.
    const lowerIt=cappedMidSentence===0 && (lowerUses>0 || FUNCTION_WORDS.has(lower) || /ing$/.test(lower));
    return lowerIt ? m[1]+lower+m[3] : t;
  }).join('');
}

function failClosed(reason){
  return {json:{...source,draftFailed:true,draftError:reason,title:'',dek:'',bodyMarkdown:'',markdown:'',slug:'',risk:'sensitive',status:'review'}};
}

let draft;
try { draft=jsonOf(textOf($json)); } catch(e) { return failClosed('Draft JSON could not be parsed: '+e.message); }

let body=String(draft.bodyMarkdown||'').trim();
let title=String(draft.title||'').replace(/\s+/g,' ').trim().replace(/\.$/,'');
const dek=String(draft.dek||'').replace(/\s+/g,' ').trim();
if(!title||!dek||!body) return failClosed('Draft is missing title, dek, or bodyMarkdown');
if(/<\s*\/?\s*[A-Za-z][^>]*>/.test(body)) return failClosed('Raw HTML is not allowed in generated articles');
title=sentenceCase(title,[source.articleText,body].join(' '));
if(title.length>180) return failClosed('Title is over 180 characters');
if(dek.length>360) return failClosed('Dek is over 360 characters');

// Short source material yields a short article; never pad. Below this floor the story is skipped.
const articleWords=words(body);
const minimumWords=Math.min(160,Math.max(120,Math.floor(Number(source.sourceWordCount||0)*0.5)));
if(articleWords<minimumWords) return failClosed(`Generated article is too short: ${articleWords} words (minimum ${minimumWords})`);

let section=allowedSections.has(String(draft.section||''))?String(draft.section):'World';
let type=allowedTypes.has(String(draft.type||''))?String(draft.type):'News';
const strongHints=new Set(['Business','Technology','Science','Crime','Sports','Culture','Film & TV','Anime','Gaming']);
// Specialist outlets/paths decide the section; general-news outlets defer to the model.
if(strongHints.has(source.sourceSectionHint)) section=source.sourceSectionHint;

const combined=[source.sourceTitle,title,body].join(' ');
const strongRisk=/\b(election|campaign|candidate|ballot|voting|war|armed conflict|air ?strike|missile|military|invasion|murder|homicide|killed|fatal|arrested|charged|indicted|accused|alleged|lawsuit|court ruling|judge|sanction|terrorism|sexual abuse|data breach|security breach|privacy breach|hacked|cyberattack)\b/i.test(combined);
const politicalOffice=/\b(president|prime minister|minister|government|white house|parliament|congress|governor|mayor)\b/i.test(combined)
  && /\b(policy|election|vote|law|ban|sanction|diplom|war|conflict|administration|court|rights|protest|deal|negotiat|press access|foreign policy)\b/i.test(combined);
const deterministicSensitive=strongRisk||politicalOffice||section==='Crime';
const risk=(String(draft.risk)==='sensitive'||deterministicSensitive)?'sensitive':'low';
// Everything starts unpublished; later gates promote it only after they pass.
const status='review';
const slug=slugify(title)||`story-${Date.now()}`;
const now=new Date();
const date=now.toISOString().slice(0,10);
const publishedAt=now.toISOString();
const readingTime=`${Math.max(1,Math.ceil(articleWords/225))} min`;
const tags=[...new Set((Array.isArray(draft.tags)?draft.tags:[]).map(x=>String(x).replace(/[<>]/g,'').trim()).filter(x=>x&&x.length<=60))].slice(0,8);
if(!tags.length) tags.push(section);
const imageMap={'World':'/images/world.svg','Business':'/images/business.svg','Technology':'/images/technology.svg','Science':'/images/technology.svg','Crime':'/images/world.svg','Sports':'/images/sports.svg','Culture':'/images/culture.svg','Film & TV':'/images/film.svg','Anime':'/images/anime.svg','Gaming':'/images/gaming.svg'};
const image=imageMap[section]||'/images/world.svg';
const imageAlt=`Editorial illustration for ${title}`.slice(0,220);
const sourceLink=canonicalSourceUrl(source.sourceLink);
if(!/^https:\/\//.test(sourceLink)) return failClosed('Source URL is not a valid https URL');
const sourceName=String(source.sourceName||'').trim()||hostOf(sourceLink)||'the original publisher';
const sourceNote=`Prepared from ${sourceName} reporting and reviewed by the Nuvellum editorial pipeline.`;

const front=[
'---',
`title: ${yaml(title)}`,
`dek: ${yaml(dek)}`,
`section: ${yaml(section)}`,
`type: ${yaml(type)}`,
`author: ${yaml('Nuvellum Global Desk')}`,
`date: ${yaml(date)}`,
`publishedAt: ${yaml(publishedAt)}`,
`readingTime: ${yaml(readingTime)}`,
`image: ${yaml(image)}`,
`imageAlt: ${yaml(imageAlt)}`,
`status: ${yaml(status)}`,
`tags: ${JSON.stringify(tags)}`,
`sourceUrls: ${JSON.stringify([sourceLink])}`,
`sourceNote: ${yaml(sourceNote)}`,
`origin: "automation"`,
`risk: ${yaml(risk)}`,
`editorialReview: "pending"`,
`reviewedBy: ""`,
'---',
''
].join('\n');
const markdown=front+body+'\n';
return {json:{...source,sourceLink,sourceName,title,dek,section,type,bodyMarkdown:body,slug,date,publishedAt,readingTime,tags,image,imageAlt,risk,status,markdown,articleWordCount:articleWords,draftFailed:false}};
