// Renders a plan to MP4: Chromium draws each frame (deterministic renderAt(t)),
// frames stream as JPEG into ffmpeg, narration clips are placed at their plan
// offsets. Output: H.264 High / yuv420p / AAC, 1080x1920, faststart.
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { frameHtml } from './template.mjs';
import { ffmpegBin } from './tts.mjs';

export function chromiumPath(env = process.env) {
  if (env.CHROMIUM_PATH) return env.CHROMIUM_PATH;
  try { const p = chromium.executablePath(); if (p && existsSync(p)) return p; } catch {}
  const root = env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(join(root, 'chromium'))) return join(root, 'chromium');
  for (const d of existsSync(root) ? readdirSync(root) : []) {
    const p = join(root, d, 'chrome-linux', 'chrome');
    if (d.startsWith('chromium-') && existsSync(p)) return p;
  }
  return undefined; // let Playwright try its default
}

function imageDataUri(path) {
  if (!path || !existsSync(path)) return null;
  const ext = path.split('.').pop().toLowerCase();
  const mime = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[ext];
  return mime ? `data:${mime};base64,${readFileSync(path).toString('base64')}` : null;
}

/**
 * @param {object} plan  from buildPlan()
 * @param {object} opts  { out, imagePath, scale (0-1, for fast previews), env, posterOut, posterAt }
 */
export async function renderVideo(plan, { out, imagePath, scale = 1, env = process.env, posterOut, posterAt = 1.2, onProgress } = {}) {
  const browser = await chromium.launch({ executablePath: chromiumPath(env), args: ['--disable-gpu', '--font-render-hinting=none'] });
  const W = Math.round(plan.width * scale / 2) * 2;
  const H = Math.round(plan.height * scale / 2) * 2;
  try {
    const page = await browser.newPage({ viewport: { width: plan.width, height: plan.height }, deviceScaleFactor: scale });
    await page.setContent(frameHtml(plan, { imageDataUri: imageDataUri(imagePath) }), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const audio = plan.lines.filter(l => l.audio);
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(plan.fps), '-i', '-'];
    if (audio.length) {
      for (const l of audio) args.push('-i', l.audio);
      const delays = audio.map((l, k) => `[${k + 1}:a]aresample=48000,adelay=${Math.round(l.start * 1000)}:all=1[a${k}]`).join(';');
      const mix = audio.map((_, k) => `[a${k}]`).join('');
      args.push('-filter_complex', `${delays};${mix}amix=inputs=${audio.length}:normalize=0,apad,atrim=0:${plan.total},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`, '-map', '0:v', '-map', '[aout]');
    } else {
      args.push('-f', 'lavfi', '-t', String(plan.total), '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a');
    }
    args.push('-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-preset', env.SHORTS_X264_PRESET || 'medium', '-crf', '20',
      '-vf', `scale=${W}:${H}`, '-r', String(plan.fps), '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', String(plan.total), '-movflags', '+faststart', out);

    const ff = spawn(ffmpegBin(env), args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let ffErr = '';
    ff.stderr.on('data', d => { ffErr += d; });
    const done = new Promise((resolve, reject) => ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${ffErr.slice(-400)}`))));

    for (let f = 0; f < plan.frames; f++) {
      const t = f / plan.fps;
      await page.evaluate((tt) => window.renderAt(tt), t);
      const jpg = await page.screenshot({ type: 'jpeg', quality: 90 });
      if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
      if (posterOut && f === Math.round(posterAt * plan.fps)) await page.screenshot({ type: 'jpeg', quality: 92, path: posterOut });
      if (onProgress && f % plan.fps === 0) onProgress(f, plan.frames);
    }
    ff.stdin.end();
    await done;
  } finally {
    await browser.close();
  }
  return out;
}

/** Render one still frame (e.g. a 1080x1920 share card) at time t. */
export async function renderStill(plan, t, file, { imagePath, env = process.env } = {}) {
  const browser = await chromium.launch({ executablePath: chromiumPath(env) });
  try {
    const page = await browser.newPage({ viewport: { width: plan.width, height: plan.height } });
    await page.setContent(frameHtml(plan, { imageDataUri: imageDataUri(imagePath) }), { waitUntil: 'load' });
    await page.evaluate((tt) => window.renderAt(tt), t);
    await page.screenshot({ type: 'jpeg', quality: 92, path: file });
  } finally { await browser.close(); }
  return file;
}
