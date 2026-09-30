import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadStory, REPO_ROOT } from '../shared/article.mjs';
import { prepareCardAssets, ASSET_FOR } from '../publish/assets.mjs';
import { processStory, needsCards, CARD_RETRIES } from '../publish/run.mjs';
import { telegram, telegramMessage } from '../publish/adapters.mjs';

const SITE = 'https://www.nuvellum.news';
const TG = { TELEGRAM_BOT_TOKEN: '123456:TESTtoken', TELEGRAM_CHAT_ID: '@nuvellum' };
const PHOTO = 'anthropic-releases-sonnet-5-5-highlighting-speed-and-lower-costs';
const TEXT = 'pokemon-tcg-s-next-big-set-available-weeks-before-official-release';
const SENSITIVE = 'us-deportations-are-triggering-a-cascade-of-rights-abuses-un-experts-warn';
const PNG_1PX = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

/** Rasteriser stand-in for tests without a browser: writes a PNG per SVG and reports no overflow. */
const fakeRaster = (overflow = []) => async (files) => files.map((f) => { const p = f.replace(/\.svg$/, '.png'); writeFileSync(p, PNG_1PX); return { file: f, png: p, overflow }; });
const fresh = (s) => ({ slug: s.slug, url: s.url, title: s.title, risk: s.risk, platforms: {} });
function tmpOut() { const d = mkdtempSync(join(tmpdir(), 'nv-pub-')); return { d, done: () => rmSync(d, { recursive: true, force: true }) }; }
function fakeTelegram(calls, { fail } = {}) {
  return { telegram: { ...telegram, post: async (story, o) => { calls.push({ slug: story.slug, assets: o.assets, pngExists: o.assets.telegram ? existsSync(o.assets.telegram) : null }); if (fail) throw fail; return { remoteId: String(calls.length), remoteUrl: null, kind: o.assets.telegram ? 'card' : 'photo' }; } } };
}
const run = (story, entry, over = {}) => processStory({ story, entry, env: TG, live: true, storyIsLive: true, copy: {}, siteUrl: SITE, now: Date.parse('2026-09-30T12:00:00Z'), ...over });

test('a newly published story gets its square card rendered and verified before Telegram posts it', async () => {
  const t = tmpOut(), calls = [], order = [];
  try {
    const story = loadStory(PHOTO);
    const res = await run(story, fresh(story), {
      prepareAssets: async (s) => { order.push('render'); return prepareCardAssets(s, { outDir: t.d, rasterise: fakeRaster() }); },
      adapters: { telegram: { ...fakeTelegram(calls).telegram, post: async (s, o) => { order.push('post'); return fakeTelegram(calls).telegram.post(s, o); } } }
    });
    assert.deepEqual(order, ['render', 'post']);
    assert.equal(calls.length, 1);
    assert.match(calls[0].assets.telegram, /square\.png$/);
    assert.equal(calls[0].pngExists, true, 'the PNG exists when the adapter is called');
    assert.equal(res.entry.platforms.telegram.status, 'sent');
    assert.equal(res.entry.platforms.telegram.kind, 'card');
    assert.equal(res.entry.cards.status, 'rendered');
    assert.deepEqual(res.entry.cards.formats.slice(0, 4), ['square', 'landscape', 'portrait', 'story']);
  } finally { t.done(); }
});

test('the asset contract maps every platform to its card; a text-led story still gets a branded card', async () => {
  assert.deepEqual(ASSET_FOR, { telegram: 'square', facebook: 'landscape', linkedin: 'landscape', x: 'landscape', threads: 'square', instagram: 'portrait', tiktok: 'story', youtube: 'story' });
  const t = tmpOut();
  try {
    const a = await prepareCardAssets(loadStory(TEXT), { outDir: t.d, rasterise: fakeRaster() });
    assert.equal(a.ok, true);
    assert.equal(a.manifest.sourceMode, 'text-led');
    const svg = readFileSync(join(t.d, TEXT, 'square.svg'), 'utf8');
    assert.match(svg, />NUVELLUM</); assert.match(svg, />nuvellum\.news</); assert.doesNotMatch(svg, /<image /);
    for (const p of ['telegram', 'x', 'instagram', 'tiktok']) assert.ok(existsSync(a.forPlatform[p]), p);
    assert.match(a.forPlatform.instagram, /portrait\.png$/);
    assert.match(a.forPlatform.youtube, /story\.png$/);
  } finally { t.done(); }
});

test('sensitive stories get no quote / key-fact cards', async () => {
  const t = tmpOut();
  try {
    const a = await prepareCardAssets(loadStory(SENSITIVE), { outDir: t.d, rasterise: fakeRaster() });
    assert.equal(a.ok, true);
    assert.match(a.manifest.quote.skipped, /sensitive/);
    assert.ok(!Object.keys(a.png).some((f) => f.startsWith('quote')));
    assert.ok(!existsSync(join(t.d, SENSITIVE, 'quote-square.svg')));
  } finally { t.done(); }
});

test('an already-sent Telegram entry is neither re-rendered nor re-posted', async () => {
  const story = loadStory(PHOTO), calls = [];
  let renders = 0;
  const entry = { ...fresh(story), platforms: { telegram: { status: 'sent', attempts: 1, remoteId: '5' } } };
  const res = await run(story, entry, { prepareAssets: async () => { renders++; return { ok: false, error: 'should not render' }; }, adapters: fakeTelegram(calls) });
  assert.equal(renders, 0);
  assert.equal(calls.length, 0);
  assert.equal(res.rendered, false);
  assert.equal(res.entry.platforms.telegram.status, 'sent');
  assert.equal(needsCards({ entry, env: TG, storyIsLive: true }), false, 'the workflow will not even install Chromium');
  assert.equal(needsCards({ entry: fresh(story), env: TG, storyIsLive: true }), true);
  assert.equal(needsCards({ entry: fresh(story), env: {}, storyIsLive: true }), false, 'no configured image platform → no cards');
  assert.equal(needsCards({ entry: fresh(story), env: TG, storyIsLive: false }), false, 'not live yet → queued, no cards');
});

test('failed rendering never posts a raw fallback or broken card', async () => {
  const story = loadStory(PHOTO), calls = [];
  const failing = async () => ({ ok: false, error: 'cards: rasterisation failed (Error: no Chromium)' });
  // Run 1: render fails → held, nothing posted.
  let r = await run(story, fresh(story), { prepareAssets: failing, adapters: fakeTelegram(calls) });
  assert.equal(calls.length, 0);
  assert.equal(r.entry.platforms.telegram.status, 'queued');
  assert.equal(r.entry.platforms.telegram.cardFailures, 1);
  assert.match(r.entry.platforms.telegram.error, /no Chromium/);
  assert.equal(r.entry.cards.status, 'failed');
  assert.ok(CARD_RETRIES >= 2);
  // Run 2: repeated failure → failed closed. No raw story photo/text fallback is ever posted.
  r = await run(story, r.entry, { prepareAssets: failing, adapters: fakeTelegram(calls) });
  assert.equal(calls.length, 0);
  assert.equal(r.entry.platforms.telegram.status, 'failed');
  assert.equal(r.entry.platforms.telegram.cardFailures, CARD_RETRIES);
  assert.match(r.entry.platforms.telegram.reason, /blocked to protect presentation quality/);
  // Run 3 and later: failed is final and still nothing is posted.
  for (let i = 0; i < 3; i++) r = await run(story, r.entry, { prepareAssets: failing, adapters: fakeTelegram(calls) });
  assert.equal(calls.length, 0, 'a card failure can never silently downgrade into a raw post');
});

test('overflowing, clipped or crashing renders are refused, not posted', async () => {
  const t = tmpOut();
  try {
    const story = loadStory(PHOTO);
    const over = await prepareCardAssets(story, { outDir: t.d, rasterise: fakeRaster(['"x" ends at 1100 > box 1008']) });
    assert.equal(over.ok, false); assert.match(over.error, /overflow/);
    const clipped = await prepareCardAssets(story, { outDir: t.d, render: () => ({ clipped: true, assets: [] }), rasterise: fakeRaster() });
    assert.equal(clipped.ok, false); assert.match(clipped.error, /clipped/);
    const crash = await prepareCardAssets(story, { outDir: t.d, render: () => { throw new TypeError('bad story'); } });
    assert.equal(crash.ok, false); assert.match(crash.error, /render failed \(TypeError: bad story\)/);
    const noBrowser = await prepareCardAssets(story, { outDir: t.d, rasterise: async () => { throw new Error('Executable does not exist'); } });
    assert.equal(noBrowser.ok, false); assert.match(noBrowser.error, /rasterisation failed/);
  } finally { t.done(); }
});

test('a Telegram API failure after a good card is retried without duplicating', async () => {
  const t = tmpOut(), calls = [];
  try {
    const story = loadStory(PHOTO);
    const prep = (s) => prepareCardAssets(s, { outDir: t.d, rasterise: fakeRaster() });
    const { PostError } = await import('../publish/adapters.mjs');
    let r = await run(story, fresh(story), { prepareAssets: prep, adapters: fakeTelegram(calls, { fail: new PostError('telegram', 'HTTP 502', { status: 502 }) }) });
    assert.equal(r.entry.platforms.telegram.status, 'queued');
    r = await run(story, r.entry, { prepareAssets: prep, adapters: fakeTelegram(calls) });
    assert.equal(r.entry.platforms.telegram.status, 'sent');
    r = await run(story, r.entry, { prepareAssets: prep, adapters: fakeTelegram(calls) });
    assert.equal(calls.length, 2, 'one failed attempt, one success, then nothing');
  } finally { t.done(); }
});

test('Telegram uploads the local card as multipart/form-data with the headline, dek and tracked link', async () => {
  const t = tmpOut();
  try {
    const png = join(t.d, 'square.png');
    writeFileSync(png, PNG_1PX);
    const story = loadStory(PHOTO);
    let seen;
    const r = await telegram.post(story, { env: TG, siteUrl: SITE, assets: { telegram: png }, fetchImpl: async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ ok: true, result: { message_id: 9, chat: { username: 'nuvellum' } } })); } });
    assert.equal(seen.url, `https://api.telegram.org/bot${TG.TELEGRAM_BOT_TOKEN}/sendPhoto`);
    assert.ok(seen.init.body instanceof FormData);
    assert.equal(seen.init.headers, undefined, 'fetch sets the multipart boundary itself');
    const photo = seen.init.body.get('photo');
    assert.equal(photo.type, 'image/png');
    assert.equal(photo.name, `${story.slug}.png`);
    assert.equal(Buffer.from(await photo.arrayBuffer()).equals(PNG_1PX), true);
    assert.equal(seen.init.body.get('chat_id'), '@nuvellum');
    assert.equal(seen.init.body.get('parse_mode'), 'HTML');
    const caption = seen.init.body.get('caption');
    assert.match(caption, /^<b>Anthropic releases Sonnet 5\.5, highlighting speed and lower costs<\/b>\n\n/);
    assert.match(caption, /utm_source=telegram/);
    assert.match(caption, /Read on Nuvellum →<\/a>$/);
    assert.ok([...caption].length <= 1024);
    assert.deepEqual(r, { remoteId: '9', remoteUrl: 'https://t.me/nuvellum/9', kind: 'card' });
    // Without a card the legacy behaviour is unchanged (story photo by URL / text).
    assert.equal(telegramMessage(story, SITE).method, 'sendPhoto');
    assert.equal(telegramMessage(story, SITE).photo, SITE + story.image);
    assert.equal(telegramMessage(loadStory(TEXT), SITE).method, 'sendMessage');
  } finally { t.done(); }
});

test('manual --slug dispatch still works (one story only; bad slugs refused)', () => {
  const t = tmpOut();
  try {
    const cli = join(REPO_ROOT, 'engines', 'publish', 'cli.mjs');
    const out = execFileSync(process.execPath, [cli, '--ledger', t.d, '--slug', TEXT], { encoding: 'utf8', env: { ...process.env, NUVELLUM_SOCIAL: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' } });
    assert.match(out, /Social publisher \(dry run; window 48h\)/);
    assert.match(out, new RegExp(`${TEXT}: telegram=skipped`));
    assert.doesNotMatch(out, /apple-ordered|anthropic-releases/, 'only the requested story');
    const need = execFileSync(process.execPath, [cli, '--ledger', t.d, '--slug', TEXT, '--needs-cards'], { encoding: 'utf8', env: { ...process.env, TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' } }).trim();
    assert.equal(need, 'no', 'no configured image platform → no Chromium');
    assert.throws(() => execFileSync(process.execPath, [cli, '--ledger', t.d, '--slug', '../etc/passwd'], { stdio: 'pipe' }));
  } finally { t.done(); }
});

// ---------- Run scope: scheduled window scan vs manual single-slug (an empty manual slug once bulk-posted) ----------

const CLI = join(REPO_ROOT, 'engines', 'publish', 'cli.mjs');
const quietEnv = { ...process.env, NUVELLUM_SOCIAL: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', GITHUB_ACTIONS: '' };
const cli = (args, env = quietEnv) => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env });

test('scope rule: schedule scans the window; manual needs a slug unless bulk is chosen deliberately', async () => {
  const { runScope } = await import('../publish/run.mjs');
  assert.deepEqual(runScope({ trigger: 'schedule' }), { mode: 'window' });
  assert.deepEqual(runScope({ trigger: 'workflow_dispatch', slug: TEXT }), { mode: 'slug' });
  assert.equal(runScope({ trigger: 'workflow_dispatch' }).mode, 'refuse');
  assert.equal(runScope({ trigger: 'workflow_dispatch', bulk: false }).mode, 'refuse');
  assert.equal(runScope({ trigger: 'workflow_dispatch', bulk: 'true' }).mode, 'refuse', 'only a real boolean opts in');
  assert.equal(runScope({}).mode, 'refuse', 'a missing trigger is treated as manual');
  assert.deepEqual(runScope({ trigger: 'workflow_dispatch', bulk: true }), { mode: 'window' });
});

test('1. a scheduled run without a slug processes the eligible window', () => {
  const t = tmpOut();
  try {
    const out = cli(['--ledger', t.d, '--trigger', 'schedule']);
    assert.match(out, /^Social publisher \(dry run; window 48h\)/m, 'the window scan ran');
    assert.doesNotMatch(out, /Manual run without a slug/);
    // Every story it considered came from the scan (none was named).
    assert.equal(cli(['--ledger', t.d, '--trigger', 'schedule', '--needs-cards']).trim(), 'no', 'no image platform configured in this env');
  } finally { t.done(); }
});

test('2. a manual run with a slug processes only that slug', () => {
  const t = tmpOut();
  try {
    const out = cli(['--ledger', t.d, '--trigger', 'workflow_dispatch', '--slug', TEXT]);
    assert.match(out, new RegExp(`${TEXT}: telegram=skipped`));
    const stories = new Set([...out.matchAll(/^ ([a-z0-9-]+):/gm)].map((m) => m[1]));
    assert.deepEqual([...stories], [TEXT], 'exactly one story');
  } finally { t.done(); }
});

test('3. a manual run with no slug and no bulk opt-in does nothing: no scan, no API call, no ledger change', () => {
  const t = tmpOut();
  try {
    const ledger = join(t.d, 'ledger');
    const env = { ...quietEnv, NUVELLUM_SOCIAL: 'on', TELEGRAM_BOT_TOKEN: '123:would-post', TELEGRAM_CHAT_ID: '@nuvellum' };
    for (const args of [['--trigger', 'workflow_dispatch'], ['--trigger', 'workflow_dispatch', '--slug', ''], []]) {
      const out = cli(['--ledger', ledger, '--live', ...args], env);
      assert.equal(out.trim(), 'Manual run without a slug: nothing was posted and the ledger is unchanged. Give a slug, or set bulk=true to deliberately process every eligible story in the window.');
      assert.equal(existsSync(ledger), false, 'the ledger directory is not even created');
    }
    assert.equal(cli(['--ledger', ledger, '--needs-cards', '--trigger', 'workflow_dispatch'], env).trim(), 'no', 'Chromium is not installed either');
    const notice = cli(['--ledger', ledger, '--trigger', 'workflow_dispatch'], { ...env, GITHUB_ACTIONS: 'true' });
    assert.match(notice, /^::notice title=Social publish::Manual run without a slug/);
  } finally { t.done(); }
});

test('4. manual bulk mode scans the window only when deliberately selected', () => {
  const t = tmpOut();
  try {
    const refused = cli(['--ledger', t.d, '--trigger', 'workflow_dispatch']);
    assert.match(refused, /Manual run without a slug/);
    const bulk = cli(['--ledger', t.d, '--trigger', 'workflow_dispatch', '--bulk']);
    assert.match(bulk, /^Social publisher \(dry run; window 48h\)/m);
    assert.doesNotMatch(bulk, /Manual run without a slug/);
  } finally { t.done(); }
});

test('the workflow wires the trigger and a default-off bulk input into both CLI calls', () => {
  const wf = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'social-publish.yml'), 'utf8');
  assert.match(wf, /      bulk:\n        description: "[^"]+"\n        type: boolean\n        default: false/);
  assert.equal((wf.match(/TRIGGER: \$\{\{ github\.event_name \}\}/g) || []).length, 2);
  assert.equal((wf.match(/BULK: \$\{\{ inputs\.bulk \}\}/g) || []).length, 2);
  assert.match(wf, /--needs-cards --trigger "\$TRIGGER" \$\{SLUG:\+--slug "\$SLUG"\} \$\(\[ "\$BULK" = "true" \] && echo --bulk\)/);
  assert.match(wf, /--live --trigger "\$TRIGGER" \$\{SLUG:\+--slug "\$SLUG"\} \$\(\[ "\$BULK" = "true" \] && echo --bulk\)/);
  assert.match(wf, /^  schedule:\n    - cron: "12,42 \* \* \* \*"/m, 'the schedule itself is unchanged');
});

// Real Chromium (opt-in: CARDS_CHROME=1): the full asset pipeline rasterises and verifies real PNGs.
test('Chromium: long real-world photo credits stay inside branded cards', { skip: !process.env.CARDS_CHROME }, async () => {
  for (const slug of [
    'trump-says-ai-companies-sign-voluntary-accord-on-safety-controls',
    'nasa-awards-orbital-safety-analysis-support-services-contract',
    'cinemacon-managing-director-mitch-neuhauser-stepping-down-following-2028-show'
  ]) {
    const t = tmpOut();
    try {
      const a = await prepareCardAssets(loadStory(slug), { outDir: t.d });
      assert.equal(a.ok, true, `${slug}: ${a.error || 'unknown card failure'}`);
      assert.ok(existsSync(a.forPlatform.telegram), `${slug}: Telegram branded card missing`);
    } finally { t.done(); }
  }
});

test('Chromium: prepareCardAssets produces verified PNGs for every format', { skip: !process.env.CARDS_CHROME }, async () => {
  const t = tmpOut();
  try {
    const a = await prepareCardAssets(loadStory(PHOTO), { outDir: t.d });
    assert.equal(a.ok, true, a.error);
    for (const f of ['square', 'landscape', 'portrait', 'story']) {
      const buf = readFileSync(a.png[f]);
      assert.equal(buf.subarray(1, 4).toString(), 'PNG');
      const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
      assert.deepEqual([w, h], { square: [1080, 1080], landscape: [1200, 630], portrait: [1080, 1350], story: [1080, 1920] }[f]);
    }
  } finally { t.done(); }
});
