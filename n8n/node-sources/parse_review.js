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

const article=$('Parse Draft & Build Markdown').item.json;
if(article.draftFailed){
  return {json:{...article,editorialApproved:false,editorialRiskScore:100,editorialIssues:[article.draftError||'Draft failed'],decisionReason:'Draft failed closed'}};
}
try {
  const d=jsonOf(textOf($json));
  const score=Number(d.risk_score);
  const issues=Array.isArray(d.issues)?d.issues:['Invalid issues field'];
  const approved=d.approved===true&&Number.isFinite(score)&&score<=20&&issues.length===0;
  const sensitive=article.risk==='sensitive'||d.sensitive===true;
  const risk=sensitive?'sensitive':'low';
  // Low-risk stories publish once review passes; sensitive stories stay in review until the second verifier clears them.
  const status=approved&&!sensitive?'published':'review';
  let markdown=article.markdown;
  markdown=setFrontmatter(markdown,'risk',JSON.stringify(risk));
  markdown=setFrontmatter(markdown,'status',JSON.stringify(status));
  markdown=setFrontmatter(markdown,'editorialReview',approved?'"passed"':'"failed"');
  return {json:{...article,editorialApproved:approved,editorialReview:approved?'passed':'failed',editorialRiskScore:Number.isFinite(score)?score:100,editorialIssues:issues,decisionReason:String(d.decision_reason||''),risk,status,markdown}};
} catch(e) {
  return {json:{...article,editorialApproved:false,editorialReview:'failed',editorialRiskScore:100,editorialIssues:['Editorial review could not be parsed'],decisionReason:'Failed closed',reviewParserError:e.message}};
}
