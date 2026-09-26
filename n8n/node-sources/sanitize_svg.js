function textOf(data){
  const c=[
    data?.content?.parts?.[0]?.text,
    data?.candidates?.[0]?.content?.parts?.[0]?.text,
    Array.isArray(data?.content)?data.content.find(x=>x?.type==='text')?.text:undefined,
    data?.text,
    typeof data?.content==='string'?data.content:undefined
  ];
  return c.find(x=>typeof x==='string'&&x.trim())||'';
}

const article=currentArticle();
let result={...article,aiImageReady:false,imageGenerationMode:'existing-svg-fallback'};

const ALLOWED=new Set(['svg','g','defs','style','path','rect','circle','ellipse','line','polyline','polygon','lineargradient','radialgradient','stop','clippath','mask','pattern','filter','title','desc',
  'fegaussianblur','feoffset','feblend','fecolormatrix','femerge','femergenode','feflood','fecomposite','feturbulence','fedisplacementmap','fedropshadow','fecomponenttransfer','fefunca','fefuncr','fefuncg','fefuncb','femorphology']);
// Same patterns the repository validator blocks in content, plus SVG-specific vectors.
const FORBIDDEN=[/<\s*script\b/i,/<\s*iframe\b/i,/<\s*object\b/i,/<\s*embed\b/i,/<\s*form\b/i,/<\s*foreignObject\b/i,/<\s*image\b/i,/<\s*use\b/i,/<\s*a\b/i,/expression\s*\(/i,/behavior\s*:/i,/<\s*animate/i,/<\s*set\b/i,
  /javascript\s*:/i,/\bon\w+\s*=/i,/\b(?:xlink:)?href\s*=/i,/data\s*:/i,/@import/i,/url\(\s*["']?\s*(?!#)/i,/<!ENTITY/i,/<!DOCTYPE/i];

try{
  let svg=textOf($json).trim()
    .replace(/^```(?:svg|xml)?\s*/i,'')
    .replace(/\s*```$/,'')
    .trim();

  const start=svg.indexOf('<svg');
  const end=svg.lastIndexOf('</svg>');
  if(start<0||end<start) throw new Error('No complete SVG returned');
  svg=svg.slice(start,end+6);

  if(svg.length<350) throw new Error('SVG too small');
  if(svg.length>120000) throw new Error('SVG too large');

  // Remove unsafe/unsupported content rather than discarding an otherwise usable illustration.
  svg=svg
    .replace(/<\?xml[\s\S]*?\?>/gi,'')
    .replace(/<!DOCTYPE[\s\S]*?>/gi,'')
    .replace(/<!--[\s\S]*?-->/g,'')
    .replace(/<script\b[\s\S]*?<\/script>/gi,'')
    .replace(/@import[^;]*;?/gi,'')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi,'')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi,'')
    .replace(/<text\b[\s\S]*?<\/text>/gi,'')
    .replace(/<(animate\w*|set)\b[^>]*\/>/gi,'')
    .replace(/<(animate\w*|set)\b[\s\S]*?<\/\1>/gi,'')
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi,'$1')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'')
    .replace(/\s(?:href|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'')
    .replace(/javascript\s*:/gi,'')
    .replace(/url\(\s*["']?\s*(?!#)[^)]*\)/gi,'none')
    .trim();

  // Drop any element outside the allowlist (children are kept, the tag itself is removed).
  svg=svg.replace(/<\/?\s*([A-Za-z][\w:.-]*)\b[^>]*?\/?>/g,(tag,name)=>ALLOWED.has(name.toLowerCase())?tag:'');

  // Normalize the canvas so the site always receives a predictable 16:9 asset.
  if(/viewBox\s*=\s*["'][^"']+["']/i.test(svg)){
    svg=svg.replace(/viewBox\s*=\s*["'][^"']+["']/i,'viewBox="0 0 1200 675"');
  }else{
    svg=svg.replace(/<svg\b/i,'<svg viewBox="0 0 1200 675"');
  }
  svg=svg.replace(/(<svg\b[^>]*?)\swidth\s*=\s*["'][^"']+["']/i,'$1').replace(/(<svg\b[^>]*?)\sheight\s*=\s*["'][^"']+["']/i,'$1');
  // Browsers only render an SVG loaded via <img> when it declares the SVG namespace.
  if(!/<svg\b[^>]*\sxmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(svg)){
    svg=svg.replace(/<svg\b/i,'<svg xmlns="http://www.w3.org/2000/svg"');
  }

  for(const re of FORBIDDEN) if(re.test(svg)) throw new Error('SVG failed safety check: '+re);
  if(!/<(path|rect|circle|ellipse|polygon|polyline|line)\b/i.test(svg)) throw new Error('SVG has no drawable shapes after sanitizing');
  if(svg.length<350) throw new Error('SVG too small after sanitizing');

  const imagePath=`/generated/ai/${article.slug}.svg`;
  const imageAlt=`AI-generated editorial illustration for ${article.title}`.replace(/[<>]/g,'').slice(0,220);
  let markdown=String(article.markdown||'');
  markdown=setFrontmatter(markdown,'image',JSON.stringify(imagePath));
  markdown=setFrontmatter(markdown,'imageAlt',JSON.stringify(imageAlt));

  result={
    ...article,
    markdown,
    image:imagePath,
    imageAlt,
    aiImageReady:true,
    aiSvgBase64:Buffer.from(svg,'utf8').toString('base64'),
    aiSvgBytes:svg.length,
    imageGenerationMode:'gemini-svg'
  };
}catch(e){
  result={...result,aiImageError:e.message};
}
return {json:result};
