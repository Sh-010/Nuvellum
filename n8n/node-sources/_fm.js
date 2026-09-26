function setFrontmatter(markdown,key,valueLine){
  const lines=String(markdown||'').split('\n');
  if(lines[0]!=='---') return markdown;
  let end=1;
  for(;end<lines.length;end++){
    if(lines[end]==='---') break;
    if(lines[end].startsWith(key+':')){
      lines[end]=`${key}: ${valueLine}`;
      return lines.join('\n');
    }
  }
  lines.splice(end,0,`${key}: ${valueLine}`);
  return lines.join('\n');
}
