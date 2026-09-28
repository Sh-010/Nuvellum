import { MIN_SECONDS, END_CARD_SECONDS } from './script.mjs';

const LEAD_IN=.3;
const GAP=.16;

function captionPages(text,maxWords=4){
  const words=String(text).split(/\s+/).filter(Boolean);
  const pages=[];
  for(let i=0;i<words.length;){
    let n=Math.min(maxWords,words.length-i);
    if(words.length-(i+n)===1) n=Math.max(2,n-1);
    pages.push(words.slice(i,i+n));
    i+=n;
  }
  return pages;
}

export function buildPlan(story,narrated,{fps=30}={}){
  let t=LEAD_IN;
  const lines=narrated.lines.map((line,i)=>{
    const start=t;
    const end=start+line.seconds;
    t=end+GAP;
    const pages=captionPages(line.text);
    const totalChars=pages.flat().reduce((sum,w)=>sum+w.length+1,0)||1;
    let pt=start;
    const timed=pages.map(words=>{
      const chars=words.reduce((sum,w)=>sum+w.length+1,0);
      const dur=(end-start)*chars/totalChars;
      let wt=pt;
      const wordsTimed=words.map(w=>{ const d=dur*(w.length+1)/chars; const out={w,start:wt,end:wt+d}; wt+=d; return out; });
      const page={start:pt,end:pt+dur,words:wordsTimed};
      pt+=dur;
      return page;
    });
    return { index:i, role:narrated.roles?.[i] || (i===0?'hook':'beat'), text:line.text, audio:line.file, start, end, pages:timed };
  });
  const endCardStart=t;
  const total=Math.max(MIN_SECONDS,endCardStart+END_CARD_SECONDS);
  return {
    fps,width:1080,height:1920,total:Math.round(total*fps)/fps,frames:Math.round(total*fps),endCardStart,lines,
    story:{ slug:story.slug,title:story.title,section:story.section,type:story.type,url:story.url,imageKind:story.imageKind }
  };
}

const srtTime=(s)=>{
  const ms=Math.round(s*1000);
  const h=String(Math.floor(ms/3600000)).padStart(2,'0');
  const m=String(Math.floor(ms/60000)%60).padStart(2,'0');
  const sec=String(Math.floor(ms/1000)%60).padStart(2,'0');
  return `${h}:${m}:${sec},${String(ms%1000).padStart(3,'0')}`;
};

export function toSrt(plan){
  let n=0;
  return plan.lines.flatMap(l=>l.pages.map(p=>`${++n}\n${srtTime(p.start)} --> ${srtTime(p.end)}\n${p.words.map(w=>w.w).join(' ')}\n`)).join('\n');
}

