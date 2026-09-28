import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO_ROOT } from '../shared/article.mjs';
import { buildScript, MAX_SECONDS } from './script.mjs';
import { narrate } from './tts.mjs';
import { buildPlan, toSrt } from './plan.mjs';
import { renderVideo } from './render.mjs';

const rel=(p)=>p?relative(REPO_ROOT,p).replaceAll('\\','/'):null;

export async function makeShort(story,{env=process.env,outDir,scale=1,fps=30,render=true,onProgress}={}){
  const dir=outDir||join(REPO_ROOT,'engines','out','shorts',story.slug);
  mkdirSync(dir,{recursive:true});
  const built=await buildScript(story,{env});
  if(built.problems.length){
    const report={slug:story.slug,status:'refused',problems:built.problems,notes:built.notes};
    writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
    return report;
  }
  let lines=built.script.lines;
  let narrated=await narrate(lines,dir,env);
  let plan=buildPlan(story,{...narrated,roles:lines.map(l=>l.role)},{fps});
  while(plan.total>MAX_SECONDS&&lines.filter(l=>l.role==='beat').length>1){
    const last=lines.map(l=>l.role).lastIndexOf('beat');
    lines=lines.filter((_,i)=>i!==last);
    narrated=await narrate(lines,dir,env);
    plan=buildPlan(story,{...narrated,roles:lines.map(l=>l.role)},{fps});
    built.notes.push('dropped final beat to stay inside 45 seconds');
  }
  const scriptPath=join(dir,'script.json');
  const planPath=join(dir,'plan.json');
  const captionsPath=join(dir,'captions.srt');
  const videoPath=join(dir,'short.mp4');
  const posterPath=join(dir,'poster.jpg');
  writeFileSync(scriptPath,JSON.stringify({...built.script,lines},null,2)+'\n');
  writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n');
  writeFileSync(captionsPath,toSrt(plan));
  if(render) await renderVideo(plan,{out:videoPath,imagePath:story.imagePath,scale,env,posterOut:posterPath,onProgress});
  const report={
    slug:story.slug,status:render?'rendered':'planned',method:built.script.method,tts:narrated.provider,seconds:plan.total,frames:plan.frames,
    notes:[...built.notes,...narrated.notes],
    files:{video:render?rel(videoPath):null,poster:render?rel(posterPath):null,captions:rel(captionsPath),script:rel(scriptPath),plan:rel(planPath)}
  };
  writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}

