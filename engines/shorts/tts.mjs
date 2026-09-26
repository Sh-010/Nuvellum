// Text-to-speech providers. Chain chosen by NUVELLUM_TTS (default "piper,espeak,silent"):
//   elevenlabs  ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID            (cloud, best quality)
//   openai      OPENAI_API_KEY, optional OPENAI_TTS_MODEL/VOICE     (cloud)
//   google      GOOGLE_TTS_API_KEY, optional GOOGLE_TTS_VOICE       (cloud)
//   piper       PIPER_MODEL=/path/voice.onnx (pip install piper-tts) (free, local, neural)
//   espeak      espeak-ng on PATH                                   (free, local, robotic)
//   silent      no audio; timing from word count                    (always available)
// Each provider writes one audio file per line; durations are measured with ffprobe.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { speechSeconds } from './script.mjs';

const has = (bin) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' }).status === 0;
export const ffmpegBin = (env = process.env) => env.FFMPEG_PATH || 'ffmpeg';
export const ffprobeBin = (env = process.env) => env.FFPROBE_PATH || 'ffprobe';

export function audioSeconds(file, env = process.env) {
  const out = execFileSync(ffprobeBin(env), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  return Number(out.trim());
}

async function fetchAudio(url, init, file) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) {
    const j = await res.json();
    if (!j.audioContent) throw new Error('no audioContent');
    writeFileSync(file, Buffer.from(j.audioContent, 'base64'));
  } else {
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
}

export const TTS = {
  silent: { available: () => true, ext: null, async synth() { return null; } },
  espeak: {
    available: () => has('espeak-ng') || has('espeak'), ext: 'wav',
    async synth(text, file, env) {
      const bin = has('espeak-ng') ? 'espeak-ng' : 'espeak';
      execFileSync(bin, ['-v', env.ESPEAK_VOICE || 'en-gb', '-s', env.ESPEAK_RATE || '158', '-w', file, text]);
    }
  },
  piper: {
    available: (env) => Boolean(env.PIPER_MODEL && existsSync(env.PIPER_MODEL)) && (has('piper') || has('python3')), ext: 'wav',
    async synth(text, file, env) {
      const [cmd, args] = has('piper') ? ['piper', []] : ['python3', ['-m', 'piper']];
      const r = spawnSync(cmd, [...args, '--model', env.PIPER_MODEL, '--output_file', file], { input: text, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`piper failed: ${String(r.stderr).slice(0, 200)}`);
    }
  },
  openai: {
    available: (env) => Boolean(env.OPENAI_API_KEY), ext: 'mp3',
    async synth(text, file, env) {
      await fetchAudio(`${env.OPENAI_BASE_URL || 'https://api.openai.com'}/v1/audio/speech`, {
        method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice: env.OPENAI_TTS_VOICE || 'alloy', input: text, response_format: 'mp3' })
      }, file);
    }
  },
  elevenlabs: {
    available: (env) => Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID), ext: 'mp3',
    async synth(text, file, env) {
      await fetchAudio(`${env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io'}/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}`, {
        method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2' })
      }, file);
    }
  },
  google: {
    available: (env) => Boolean(env.GOOGLE_TTS_API_KEY), ext: 'mp3',
    async synth(text, file, env) {
      await fetchAudio(`${env.GOOGLE_TTS_BASE_URL || 'https://texttospeech.googleapis.com'}/v1/text:synthesize`, {
        method: 'POST', headers: { 'x-goog-api-key': env.GOOGLE_TTS_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ input: { text }, voice: { languageCode: 'en-GB', name: env.GOOGLE_TTS_VOICE || 'en-GB-Neural2-B' }, audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 } })
      }, file);
    }
  }
};

/**
 * Narrate every script line with the first provider in the chain that works for
 * ALL lines (mixed voices are never produced). Falls back to silent timing.
 * @returns {Promise<{ provider: string, lines: {text, file, seconds}[] , notes: string[] }>}
 */
export async function narrate(lines, workDir, env = process.env) {
  const chain = (env.NUVELLUM_TTS || 'piper,espeak,silent').split(',').map(s => s.trim()).filter(s => TTS[s]);
  if (!chain.includes('silent')) chain.push('silent');
  const notes = [];
  for (const name of chain) {
    const p = TTS[name];
    if (!p.available(env)) { notes.push(`${name}: not available`); continue; }
    if (name === 'silent') return { provider: 'silent', lines: lines.map(l => ({ text: l.text, file: null, seconds: speechSeconds(l.text) })), notes };
    try {
      const out = [];
      for (const [i, l] of lines.entries()) {
        const file = join(workDir, `line-${String(i).padStart(2, '0')}.${p.ext}`);
        await p.synth(l.text, file, env);
        out.push({ text: l.text, file, seconds: audioSeconds(file, env) + 0.25 });
      }
      return { provider: name, lines: out, notes };
    } catch (err) {
      notes.push(`${name}: failed (${String(err.message).slice(0, 120)})`);
    }
  }
  throw new Error('unreachable: silent provider always succeeds');
}
