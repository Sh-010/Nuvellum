// Shorts pipeline: article -> script (+verification) -> narration -> plan -> MP4 + SRT + poster + report.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../shared/article.mjs';
import { buildScript, MAX_SECONDS } from './script.mjs';
import { narrate } from './tts.mjs';
import { buildPlan, toSrt } from './plan.mjs';
import { renderVideo } from './render.mjs';

export async function makeShort(story, { env = process.env, outDir, scale = 1, fps = 30, render = true, onProgress } = {}) {
  const dir = outDir || join(REPO_ROOT, 'engines', 'out', 'shorts', story.slug);
  mkdirSync(dir, { recursive: true });
  const { script, notes, problems } = await buildScript(story, { env });
  if (problems.length) {
    // The extractive fallback failed verification too: refuse to produce a video.
    const report = { slug: story.slug, status: 'refused', problems, notes };
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
    return report;
  }
  let lines = script.lines;
  let narrated = await narrate(lines, dir, env);
  let plan = buildPlan(story, { ...narrated, roles: lines.map(l => l.role) }, { fps });
  // Real voices can be slower than the estimate: drop the last beat until it fits.
  while (plan.total > MAX_SECONDS && lines.filter(l => l.role === 'beat').length > 1) {
    const lastBeat = lines.map(l => l.role).lastIndexOf('beat');
    lines = lines.filter((_, i) => i !== lastBeat);
    narrated = await narrate(lines, dir, env);
    plan = buildPlan(story, { ...narrated, roles: lines.map(l => l.role) }, { fps });
    notes.push('dropped a beat to stay within 45 s');
  }
  writeFileSync(join(dir, 'script.json'), JSON.stringify({ ...script, lines }, null, 2));
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2));
  writeFileSync(join(dir, 'captions.srt'), toSrt(plan));
  const report = {
    slug: story.slug, status: render ? 'rendered' : 'planned', method: script.method, tts: narrated.provider,
    seconds: plan.total, frames: plan.frames, notes: [...notes, ...narrated.notes],
    files: { video: render ? join(dir, 'short.mp4') : null, poster: render ? join(dir, 'poster.jpg') : null, captions: join(dir, 'captions.srt'), script: join(dir, 'script.json'), plan: join(dir, 'plan.json') }
  };
  if (render) await renderVideo(plan, { out: report.files.video, imagePath: story.image.path, scale, env, posterOut: report.files.poster, onProgress });
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}
