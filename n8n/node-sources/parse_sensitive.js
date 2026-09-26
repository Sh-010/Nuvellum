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

const article=$('Parse Editorial Review').item.json;
try{
  const d=jsonOf(textOf($json));
  const score=Number(d.risk_score);
  const issues=Array.isArray(d.issues)?d.issues:['Invalid issues field'];
  // Only an explicit, clean pass clears a sensitive story; anything uncertain fails closed.
  const verified=article.editorialApproved===true && d.publishable===true && Number.isFinite(score) && score<=10 && issues.length===0;

  let markdown=String(article.markdown||'');
  markdown=setFrontmatter(markdown,'verification',verified?'"cleared"':'"failed"');
  markdown=setFrontmatter(markdown,'status',verified?'"published"':'"review"');
  markdown=setFrontmatter(markdown,'reviewedBy',verified?'"Nuvellum Verification Pipeline"':'""');

  return {json:{
    ...article,
    markdown,
    status: verified ? 'published' : 'review',
    verification: verified ? 'cleared' : 'failed',
    reviewedBy: verified ? 'Nuvellum Verification Pipeline' : '',
    sensitiveVerified: verified,
    sensitiveRiskScore: Number.isFinite(score)?score:100,
    sensitiveIssues: issues,
    sensitiveDecisionReason: String(d.reason||'')
  }};
}catch(e){
  return {json:{
    ...article,
    status:'review',
    verification:'failed',
    sensitiveVerified:false,
    sensitiveRiskScore:100,
    sensitiveIssues:['Sensitive verification could not be parsed'],
    sensitiveDecisionReason:'Failed closed',
    sensitiveVerificationError:e.message
  }};
}
