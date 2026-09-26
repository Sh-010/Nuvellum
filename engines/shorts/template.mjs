// 9:16 frame template. A single static page whose appearance is a pure
// function of time: window.renderAt(t). No CSS animations or timers, so the
// same plan always yields the same frames.
import { BRAND } from '../shared/brand.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function frameHtml(plan, { imageDataUri } = {}) {
  const c = BRAND.colors;
  const s = plan.story;
  const kicker = `${s.section} · ${s.type}`.toUpperCase();
  const artLabel = { 'ai-illustration': 'AI-GENERATED ILLUSTRATION', 'editorial-illustration': 'EDITORIAL ILLUSTRATION', 'section-illustration': 'ILLUSTRATION' }[s.imageKind] || '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${plan.width}px;height:${plan.height}px;overflow:hidden;background:${c.paper};color:${c.ink};-webkit-font-smoothing:antialiased}
body{font-family:${BRAND.serif}}
#progress{position:absolute;left:0;top:0;height:10px;background:${c.ox};width:0}
.mast{position:absolute;left:72px;right:72px;top:64px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${c.ink};padding-bottom:22px}
.brand{font-size:46px;letter-spacing:14px;font-weight:700}
.kick{font-family:${BRAND.sans};font-size:24px;letter-spacing:4px;font-weight:700;color:${c.ox}}
.art{position:absolute;left:72px;right:72px;top:190px;height:585px;overflow:hidden;background:${c.night};box-shadow:0 18px 50px rgba(30,20,10,.18)}
.art img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 45%}
.art .label{position:absolute;left:18px;bottom:16px;font-family:${BRAND.sans};font-size:18px;letter-spacing:3px;color:#fff;background:rgba(0,0,0,.55);padding:6px 10px}
.hook{position:absolute;left:72px;right:72px;top:860px;font-size:66px;line-height:1.14;font-weight:700;letter-spacing:-.5px}
.hook .rule{width:120px;height:8px;background:${c.ox};margin-bottom:34px}
.cap{position:absolute;left:60px;right:60px;top:900px;min-height:760px;display:flex;align-items:center;justify-content:center;text-align:center}
.cap .page{font-family:${BRAND.sans};font-weight:800;font-size:78px;line-height:1.15;letter-spacing:-1px}
.cap .w{display:inline-block;margin:0 .14em;transition:none}
.cap .w.fut{color:${c.line}}
.cap .w.now{color:${c.ox};text-decoration:underline;text-decoration-thickness:8px;text-underline-offset:14px}
.foot{position:absolute;left:72px;right:72px;bottom:70px;display:flex;justify-content:space-between;font-family:${BRAND.sans};font-size:24px;color:${c.muted};border-top:1px solid ${c.line};padding-top:22px}
.end{position:absolute;inset:0;background:${c.ox};color:${c.paper};display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 90px;opacity:0}
.end .brand{font-size:96px;letter-spacing:22px;color:${c.paper}}
.end .tag{font-style:italic;font-size:44px;margin-top:26px;opacity:.9}
.end .rule{width:160px;height:4px;background:${c.paper};margin:70px auto 60px;opacity:.7}
.end .title{font-size:50px;line-height:1.2;font-weight:700}
.end .cta{margin-top:64px;font-family:${BRAND.sans};font-size:34px;letter-spacing:3px;font-weight:700}
.end .url{margin-top:18px;font-family:${BRAND.sans};font-size:30px;opacity:.85}
</style></head><body>
<div id="progress"></div>
<div class="mast"><div class="brand">${esc(BRAND.name)}</div><div class="kick">${esc(kicker)}</div></div>
<div class="art">${imageDataUri ? `<img id="art" src="${imageDataUri}">` : ''}${artLabel ? `<div class="label">${artLabel}</div>` : ''}</div>
<div class="hook" id="hook"><div class="rule"></div><div id="hookText"></div></div>
<div class="cap"><div class="page" id="page"></div></div>
<div class="foot"><div>${esc(s.sourceLine)}</div><div>${esc(BRAND.siteUrl.replace(/^https?:\/\//, ''))}</div></div>
<div class="end" id="end"><div class="brand">${esc(BRAND.name)}</div><div class="tag">${esc(BRAND.tagline)}</div><div class="rule"></div><div class="title">${esc(s.title)}</div><div class="cta">READ THE FULL STORY</div><div class="url">${esc(BRAND.siteUrl.replace(/^https?:\/\//, ''))}</div></div>
<script>
const PLAN=${JSON.stringify({ total: plan.total, endCardStart: plan.endCardStart, lines: plan.lines.map(l => ({ role: l.role, text: l.text, start: l.start, end: l.end, pages: l.pages })) })};
const $=id=>document.getElementById(id);
const escH=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ease=x=>x<0?0:x>1?1:1-Math.pow(1-x,3);
let lastKey='';
window.renderAt=function(t){
  $('progress').style.width=(Math.min(1,t/PLAN.total)*100)+'%';
  const art=$('art'); if(art){ art.style.transform='scale('+(1.02+0.08*Math.min(1,t/PLAN.total))+') translateY('+(-12*Math.min(1,t/PLAN.total))+'px)'; }
  const hook=PLAN.lines[0];
  const hookOn=hook&&t<hook.end+0.15;
  $('hook').style.opacity=hookOn?ease((t-hook.start+0.3)/0.35):0;
  $('hook').style.transform='translateY('+(hookOn?(1-ease((t-hook.start+0.3)/0.35))*30:0)+'px)';
  if($('hookText').textContent!==(hook?hook.text:'')) $('hookText').textContent=hook?hook.text:'';
  // captions for beats and CTA (the hook is shown as a headline card instead)
  let page=null;
  for(const l of PLAN.lines){ if(l===hook) continue; for(const p of l.pages){ if(t>=p.start&&t<p.end+ (p===l.pages[l.pages.length-1]?0.15:0)) page=p; } }
  const key=page?page.start+':'+page.words.map(w=>t>=w.end?'p':t>=w.start?'n':'f').join(''):'none';
  if(key!==lastKey){
    $('page').innerHTML=page?page.words.map(w=>'<span class="w '+(t>=w.end?'past':t>=w.start?'now':'fut')+'">'+escH(w.w)+'</span>').join(' '):'';
    lastKey=key;
  }
  const endOp=ease((t-PLAN.endCardStart)/0.45);
  $('end').style.opacity=t>=PLAN.endCardStart?endOp:0;
};
window.renderAt(0);
</script></body></html>`;
}
