// The article for this loop iteration: the verified version for sensitive stories, the reviewed one otherwise.
// Checking the slug stops a stale verification result from an earlier iteration leaking in.
function currentArticle(){
  const reviewed=$('Parse Editorial Review').item.json;
  if(reviewed.risk!=='sensitive') return reviewed;
  let verified=null;
  try { verified=$('Parse Sensitive Verification').item.json; } catch {}
  if(!verified || verified.slug!==reviewed.slug || verified.sensitiveVerified!==true) throw new Error('Sensitive story reached publishing without clearing verification');
  return verified;
}
