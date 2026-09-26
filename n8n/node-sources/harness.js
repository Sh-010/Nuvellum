// Minimal n8n Code-node emulator: $json, $input, $('Node').item.json, no URL global.
const fs=require('fs');
function run(file,{json,items,nodes}){
  const code=fs.readFileSync(__dirname+'/out/'+file,'utf8');
  const $=(n)=>{ if(!(n in nodes)) throw new Error('Node '+n+' has not run'); return {item:{json:nodes[n]}, all:()=>[{json:nodes[n]}]}; };
  const $input={all:()=>items||[{json}], first:()=>(items||[{json}])[0]};
  const f=new Function('$json','$input','$','URL','Buffer',code);
  return f(json,$input,$,undefined,Buffer);
}
module.exports={run};
