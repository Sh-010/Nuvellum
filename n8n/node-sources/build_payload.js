const article=$('Sanitize Editorial SVG').item.json;
const ref=$json;
const baseSha=ref?.object?.sha;
if(!baseSha) throw new Error('GitHub main SHA missing');

// Final contract gate: nothing reaches GitHub unless the metadata matches what the gates decided.
const fm=String(article.markdown||'').split('\n---')[0];
const has=(k,v)=>fm.split('\n').some(l=>l.trim()===k+': '+JSON.stringify(v));
const problems=[];
if(!has('editorialReview','passed')) problems.push('editorialReview is not "passed"');
if(!has('status','published')) problems.push('status is not "published"');
if(article.risk==='sensitive'){
  if(!has('verification','cleared')) problems.push('sensitive story without verification: "cleared"');
  if(!has('reviewedBy','Nuvellum Verification Pipeline')) problems.push('sensitive story without pipeline reviewedBy');
}
if(/Prepared from (Source|Unknown|undefined) reporting/i.test(fm)) problems.push('placeholder sourceNote');
if(!/^sourceUrls: \["https:\/\/[^"]+"\]$/m.test(fm)) problems.push('sourceUrls is not a single https URL');
if(/[?&](utm_|fbclid|gclid|__source)/i.test(fm)) problems.push('tracking parameters in sourceUrls');
if(article.aiImageReady && !has('image','/generated/ai/'+article.slug+'.svg')) problems.push('image metadata does not match committed SVG');
if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(article.slug||''))) problems.push('invalid slug');
if(problems.length) throw new Error('Refusing to commit '+article.slug+': '+problems.join('; '));

const sourceKey=dedupeKey(article.sourceLink);
const hash=sourceHash(article.sourceLink);
// One branch per source: incoming/<slug up to 60 chars>-<8-hex source hash>.
const branchName=`incoming/${String(article.slug).slice(0,60).replace(/-+$/,'')}-${hash}`;
const contentBase64=Buffer.from(article.markdown,'utf8').toString('base64');
const prTitle=`Editorial: ${article.title}`;
const prBody=[
  'Automated Nuvellum editorial candidate.',
  '',
  `**Risk:** ${article.risk}`,
  `**Proposed status:** ${article.status}`,
  `**Source:** ${article.sourceLink}`,
  `**Source outlet:** ${article.sourceName}`,
  `**Section:** ${article.section}`,
  `**Editorial review:** passed (risk score ${article.editorialRiskScore})`,
  article.risk==='sensitive' ? `**Sensitive verification:** cleared (risk score ${article.sensitiveRiskScore}) — reviewedBy: Nuvellum Verification Pipeline` : '**Sensitive verification:** not required',
  `**Editorial image:** ${article.aiImageReady ? 'Gemini-generated SVG (sanitized) included in this PR' : 'Section fallback illustration (AI SVG unavailable: '+(article.aiImageError||'n/a')+')'}`,
  '',
  article.risk==='sensitive'
    ? 'Sensitive story cleared by Nuvellum\'s second-pass verification pipeline; repository checks still must pass before publication.'
    : 'Low-risk candidate cleared by editorial review; repository checks still must pass before publication.',
  '',
  `Review note: ${article.decisionReason || 'No additional note.'}`,
  '',
  'Opened by the Nuvellum n8n newsroom workflow.'
].join('\n');
return {json:{...article,baseSha,sourceKey,sourceHash:hash,branchName,contentBase64,prTitle,prBody}};
