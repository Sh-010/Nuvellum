import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { speechSeconds } from './script.mjs';

const has=(bin)=>spawnSync(process.platform==='win32'?'where':'which',[bin],{stdio:'ignore'}).status===0;
export const ffmpegBin=(env=process.env)=>env.FFMPEG_PATH||'ffmpeg';
export const ffprobeBin=(env=process.env)=>env.FFPROBE_PATH||'ffprobe';

export function audioSeconds(file,env=process.env){
  const out=execFileSync(ffprobeBin(env),['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8'});
  return Number(out.trim());
}

const providers={
  espeak:{
    available:()=>has('espeak-ng')||has('espeak'),
    async synth(text,file,env){
      const bin=has('espeak-ng')?'espeak-ng':'espeak';
      execFileSync(bin,['-v',env.ESPEAK_VOICE||'en-gb','-s',env.ESPEAK_RATE||'158','-w',file,text]);
    }
  },
  piper:{
    available:(env)=>Boolean(env.PIPER_MODEL&&existsSync(env.PIPER_MODEL))&&(has('piper')||has('python3')),
    async synth(text,file,env){
      const cmd=has('piper')?'piper':'python3';
      const args=has('piper')?['--model',env.PIPER_MODEL,'--output_file',file]:['-m','piper','--model',env.PIPER_MODEL,'--output_file',file];
      const r=spawnSync(cmd,args,{input:text,encoding:'utf8'});
      if(r.status!==0) throw new Error('piper failed');
    }
  }
  silent:{available:()=>true,async synth(){}}
};

export async function narrate(lines,workDir,env=process.env){
  const chain=(env.NUVELLUM_TTS||'piper,espeak,silent').split(',').map(x=>x.trim()).filter(x=>providers[x]);
  if(!chain.includes('silent')) chain.push('silent');
  const notes=[];
  for(const name of chain){
    const p=providers[name];
    if(!p.available(env)){ notes.push(name+': not available'); continue; }
    if(name==='silent') return { provider:'silent',lines:lines.map(l=>({text:l.text,file:null,seconds:speechSeconds(l.text)})),notes };
    try{
      const out=[];
      for(const [i,line] of lines.entries()){
        const file=join(workDir,`line-${String(i).padStart(2,'0')}.wav`);
        await p.synth(line.text,file,env);
        out.push({text:line.text,file,seconds:audioSeconds(file,env)+.2});
      }
      return {provider:name,lines:out,notes};
    }catch(err){ notes.push(name+': failed ('+String(err.message).slice(0,100)+')'); }
  }
  throw new Error('no TTS provider available');
}

