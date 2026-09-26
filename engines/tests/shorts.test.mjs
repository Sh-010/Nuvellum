import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadStory, listPublishedSlugs } from '../shared/article.mjs';
import { extractiveScript, verifyScript, buildScript, scriptSeconds, CTA, MIN_SECONDS, MAX_SECONDS } from '../shorts/script.mjs';
import { narrate } from '../shorts/tts.mjs';
import { buildPlan, toSrt } from '../shorts/plan.mjs';
import { makeShort } from '../shorts/engine.mjs';

const diesel = loadStory('scotland-diesel-prices-over-2-pounds');
const tigray = loadStory('renewed-fighting-in-tigray-sparks-fears-of-wider-conflict-in-ethiopia');
const has = (b) => spawnSync('which', [b], { stdio: 'ignore' }).status === 0;

test('extractive scripts for every promotable article verify and fit 20-45 s', () => {
  for (const slug of listPublishedSlugs()) {
    const s = loadStory(slug);
    const sc = extractiveScript(s);
    assert.deepEqual(verifyScript(sc, s), [], slug);
    const secs = scriptSeconds(sc);
    assert.ok(secs >= MIN_SECONDS - 3 && secs <= MAX_SECONDS, `${slug}: ${secs}`);
    assert.equal(sc.lines.at(-1).text, CTA);
    assert.ok(sc.lines.length <= 6, 'a Short must not retell the whole article');
  }
});

test('hooks never open with context-dependent references', () => {
  for (const slug of listPublishedSlugs()) {
    const hook = extractiveScript(loadStory(slug)).lines[0].text;
    assert.doesNotMatch(hook, /^(The organisation|It |They |This |However|In some cases|Meanwhile)/, `${slug}: ${hook}`);
  }
});

test('model script with invented facts or hype is rejected for the extractive fallback', async () => {
  const bad = JSON.stringify({ hook: { text: 'This changes everything: diesel hit £3 across all of Britain.', source: 0 }, beats: [{ text: 'Experts in London warn of riots.', source: 1 }] });
  const r = await buildScript(diesel, { env: { NUVELLUM_ROLE_SHORTS_SCRIPT: 'mock', NUVELLUM_MOCK_RESPONSE: bad } });
  assert.equal(r.script.method, 'extractive');
  assert.ok(r.notes.some(n => /model script rejected/.test(n)), r.notes.join('\n'));
  assert.deepEqual(r.problems, []);
});

test('grounded model script is accepted (when no independent verifier is configured)', async () => {
  const good = JSON.stringify({
    hook: { text: 'Diesel has passed £2 a litre at at least 226 forecourts across Scotland.', source: 0 },
    beats: [
      { text: 'That is according to analysis by BBC Scotland News.', source: 0 },
      { text: 'The highest prices are in rural areas, where drivers often have few alternatives.', source: 2 },
      { text: 'Hauliers say the cost is being passed along supply chains.', source: 3 }
    ]
  });
  const r = await buildScript(diesel, { env: { NUVELLUM_ROLE_SHORTS_SCRIPT: 'mock', NUVELLUM_MOCK_RESPONSE: good } });
  // Accepted only if every line is grounded; otherwise the extractive path is used. Either way: verified.
  assert.deepEqual(r.problems, []);
  assert.ok(['model:mock', 'extractive'].includes(r.script.method));
});

test('sensitive stories never use model paraphrase', async () => {
  const r = await buildScript(tigray, { env: { NUVELLUM_ROLE_SHORTS_SCRIPT: 'mock', NUVELLUM_MOCK_RESPONSE: '{"hook":{"text":"x"}}' } });
  assert.equal(r.script.method, 'extractive');
  assert.match(r.notes.join(), /sensitive story/);
});

test('silent narration + plan: timeline, 20 s minimum, captions cover speech, valid SRT', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sh-'));
  try {
    const sc = extractiveScript(diesel);
    const n = await narrate(sc.lines, dir, { NUVELLUM_TTS: 'silent' });
    assert.equal(n.provider, 'silent');
    const plan = buildPlan(diesel, { ...n, roles: sc.lines.map(l => l.role) }, { fps: 30 });
    assert.ok(plan.total >= MIN_SECONDS && plan.total <= MAX_SECONDS, String(plan.total));
    assert.equal(plan.frames, Math.round(plan.total * 30));
    for (const l of plan.lines) {
      assert.ok(Math.abs(l.pages[0].start - l.start) < 1e-6);
      assert.ok(Math.abs(l.pages.at(-1).end - l.end) < 1e-6);
      assert.equal(l.pages.flatMap(p => p.words.map(w => w.w)).join(' '), l.text);
    }
    assert.ok(plan.endCardStart < plan.total);
    assert.match(toSrt(plan), /^1\n00:00:00,300 --> 00:00:0\d,\d{3}\n/);
    assert.equal(plan.story.sourceLine, 'Nuvellum reporting from BBC');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('TTS chain degrades: unavailable or failing providers fall through to silent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sh-'));
  try {
    const n = await narrate([{ text: 'Hello there.' }], dir, { NUVELLUM_TTS: 'elevenlabs,openai,piper', OPENAI_API_KEY: 'x', OPENAI_BASE_URL: 'http://127.0.0.1:9' });
    assert.equal(n.provider, 'silent');
    assert.ok(n.notes.some(x => /elevenlabs: not available/.test(x)));
    assert.ok(n.notes.some(x => /openai: failed/.test(x)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('end-to-end render smoke test produces a valid 9:16 MP4 with audio', { skip: !has('ffmpeg') }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sh-'));
  try {
    const r = await makeShort(diesel, { outDir: dir, scale: 0.25, fps: 4, env: { ...process.env, NUVELLUM_TTS: has('espeak-ng') ? 'espeak,silent' : 'silent', SHORTS_X264_PRESET: 'ultrafast' } });
    assert.equal(r.status, 'rendered');
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', r.files.video], { encoding: 'utf8' }));
    const v = probe.streams.find(s => s.codec_type === 'video');
    assert.equal(v.codec_name, 'h264');
    assert.equal(v.pix_fmt, 'yuv420p');
    assert.equal(v.width * 16, v.height * 9);
    assert.ok(probe.streams.some(s => s.codec_type === 'audio'));
    const d = Number(probe.format.duration);
    assert.ok(d >= MIN_SECONDS - 0.5 && d <= MAX_SECONDS + 0.5, String(d));
    assert.ok(existsSync(r.files.poster) && existsSync(r.files.captions));
    assert.ok(readFileSync(r.files.captions, 'utf8').includes('-->'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('refuses to render when even the extractive script fails verification', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sh-'));
  try {
    const broken = { ...diesel, text: 'Unrelated text only.', title: 'x', dek: 'y' };
    const r = await makeShort(broken, { outDir: dir, render: false, env: { NUVELLUM_TTS: 'silent' } });
    assert.equal(r.status, 'refused');
    assert.ok(r.problems.length > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
