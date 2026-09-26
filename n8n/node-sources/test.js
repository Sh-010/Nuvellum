const {run}=require('./harness');
const fs=require('fs');
const ex=JSON.parse(fs.readFileSync(process.env.EXF,'utf8'));
const rd=ex.data.resultData.runData; const out=n=>rd[n][0].data.main[0][0].json;
const assert=(c,m)=>{ if(!c){console.log('FAIL',m);process.exitCode=1;} else console.log('ok  ',m); };

// Queue
const feed=[
 {json:{title:'Live: Storm latest',link:'https://www.bbc.co.uk/news/live/world-123',isoDate:'2026-09-26T10:00:00Z'}},
 {json:{title:'In pictures: Paris',link:'https://www.bbc.co.uk/news/in-pictures-123',isoDate:'2026-09-26T09:59:00Z'}},
 {json:{title:'Watch the launch',link:'https://www.nasa.gov/video/launch/',isoDate:'2026-09-26T09:58:00Z'}},
 {json:{title:'Pope visits France',link:'https://www.france24.com/en/pope-visit?utm_source=rss&utm_medium=feed#x',isoDate:'2026-09-26T09:00:00Z'}},
 {json:{title:'Pope visits France dup',link:'https://france24.com/en/pope-visit/',isoDate:'2026-09-26T08:00:00Z'}},
 {json:{title:'Chip maker results',link:'https://www.cnbc.com/2026/09/26/chip.html?__source=rss',isoDate:'2026-09-26T08:30:00Z'}},
 {json:{title:'New game revealed',link:'https://www.ign.com/articles/new-game',isoDate:'2026-09-26T07:00:00Z'}},
 {json:{title:'No date story',link:'https://www.theverge.com/x/story'}},
 {json:{error:'feed failed'}},
];
const q=run('queue.js',{items:feed});
console.log(q.map(i=>[i.json.link,i.json._sourceHost,i.json._sectionHint].join(' | ')).join('\n'));
assert(q.length===3,'queue selects 3 diverse candidates');
assert(q.every(i=>!/utm_|__source|#/.test(i.json.link)),'tracking params stripped');
assert(!q.some(i=>/live|pictures|video/.test(i.json.link)),'live/gallery/video blocked');

// Prepare Source with real 894 data
const ps=run('prepare_source.js',{json:out('Extract Source Text'),nodes:{'Process One by One':{...out('Queue Latest Candidates'),_sectionHint:'World'}}});
console.log('prepare:',ps.json.sourceName,ps.json.sourceSectionHint,ps.json.sourceTextKind,ps.json.sourceWordCount,ps.json.sourceLink);
assert(ps.json.sourceName==='France 24','source outlet resolved (was "Source")');

// Draft
const d=run('parse_draft.js',{json:out('Gemini Draft Article'),nodes:{'Prepare Source':ps.json}});
console.log('title:',d.json.title,'| failed:',d.json.draftFailed,d.json.draftError||'');
console.log(d.json.markdown.split('\n---')[0]);
assert(!/Prepared from Source/.test(d.json.markdown),'no placeholder sourceNote');

// Review (approved) -> low risk published
const rv=run('parse_review.js',{json:out('Gemini Editorial Review'),nodes:{'Parse Draft & Build Markdown':d.json}});
assert(/editorialReview: "passed"/.test(rv.json.markdown)&&/status: "published"/.test(rv.json.markdown),'low-risk: editorialReview passed + published');

// Sensitive path simulation
const sens={...d.json,risk:'sensitive',markdown:d.json.markdown.replace('risk: "low"','risk: "sensitive"')};
const rvS=run('parse_review.js',{json:out('Gemini Editorial Review'),nodes:{'Parse Draft & Build Markdown':sens}});
assert(/status: "review"/.test(rvS.json.markdown),'sensitive stays review after editorial review');
const pass={content:{parts:[{text:'{"publishable":true,"risk_score":3,"issues":[],"reason":"ok"}'}]}};
const fail={content:{parts:[{text:'{"publishable":false,"risk_score":40,"issues":["x"],"reason":"no"}'}]}};
const junk={content:{parts:[{text:'not json'}]}};
const vs=run('parse_sensitive.js',{json:pass,nodes:{'Parse Editorial Review':rvS.json}});
assert(/verification: "cleared"/.test(vs.json.markdown)&&/reviewedBy: "Nuvellum Verification Pipeline"/.test(vs.json.markdown)&&/status: "published"/.test(vs.json.markdown)&&vs.json.sensitiveVerified,'sensitive cleared metadata');
assert(run('parse_sensitive.js',{json:fail,nodes:{'Parse Editorial Review':rvS.json}}).json.sensitiveVerified===false,'sensitive fail -> not verified');
assert(run('parse_sensitive.js',{json:junk,nodes:{'Parse Editorial Review':rvS.json}}).json.sensitiveVerified===false,'sensitive junk -> fails closed');

// SVG with real 894 Gemini output, plus a malicious one
const sv=run('sanitize_svg.js',{json:out('Gemini Editorial SVG'),nodes:{'Parse Editorial Review':rv.json}});
console.log('svg ready',sv.json.aiImageReady,sv.json.aiImageError||'',sv.json.aiSvgBytes);
assert(sv.json.aiImageReady,'real SVG passes sanitizer');
const evil='<svg width="10" viewBox="0 0 1 1"><script>alert(1)</script><style>@import url(http://x/y.css); .a{fill:url(http://evil/)}</style><image href="http://x"/><rect onload="x()" width="1200" height="675" fill="url(#g)"/><foreignObject><div>x</div></foreignObject><circle r="4"/><path d="M0 0L10 10"/><text>HI</text><animate attributeName="x"/>'+' '.repeat(400)+'</svg>';
const sv2=run('sanitize_svg.js',{json:{content:{parts:[{text:evil}]}},nodes:{'Parse Editorial Review':rv.json}});
const cleaned=sv2.json.aiSvgBase64?Buffer.from(sv2.json.aiSvgBase64,'base64').toString():'';
console.log('evil ->',sv2.json.aiImageReady,sv2.json.aiImageError||'',cleaned.slice(0,300));
assert(!/script|@import|http:\/\/evil|onload|<image|foreignObject|<text|animate/.test(cleaned),'malicious SVG neutralised');
// stale sensitive data from previous iteration must not leak
let threw=false; try{ run('sanitize_svg.js',{json:out('Gemini Editorial SVG'),nodes:{'Parse Editorial Review':{...rvS.json,slug:'other'},'Parse Sensitive Verification':vs.json}}) }catch{threw=true}
assert(threw,'sensitive article with mismatched verification is refused');

// Payload
const bp=run('build_payload.js',{json:{object:{sha:'abc'}},nodes:{'Sanitize Editorial SVG':sv.json}});
console.log('branch',bp.json.branchName);
assert(/^incoming\/[a-z0-9-]{1,60}-[0-9a-f]{8}$/.test(bp.json.branchName),'branch naming');
fs.writeFileSync(__dirname+'/sample-article.md',Buffer.from(bp.json.contentBase64,'base64').toString());
fs.writeFileSync(__dirname+'/sample.svg',Buffer.from(sv.json.aiSvgBase64,'base64').toString());
let blocked=false; try{ run('build_payload.js',{json:{object:{sha:'abc'}},nodes:{'Sanitize Editorial SVG':{...sv.json,markdown:sv.json.markdown.replace('editorialReview: "passed"','editorialReview: "pending"')}}}) }catch(e){blocked=true}
assert(blocked,'contract gate blocks unreviewed article');
