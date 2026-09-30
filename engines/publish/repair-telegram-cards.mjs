#!/usr/bin/env node
// One-shot maintenance utility: replace Telegram posts that were sent with a raw story photo before the
// branded-card pipeline succeeded. It edits the existing Telegram message in place (no duplicate post) and
// updates the social ledger. Nothing happens unless --live is supplied and NUVELLUM_SOCIAL=on.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadStory } from '../shared/article.mjs';
import { prepareCardAssets } from './assets.mjs';
import { telegramMessage } from './adapters.mjs';

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : null; };
const ledgerDir = arg('ledger');
const live = argv.includes('--live') && process.env.NUVELLUM_SOCIAL === 'on';
const env = process.env;
const siteUrl = String(env.SITE_URL || 'https://www.nuvellum.news').replace(/\/+$/, '');

if (!ledgerDir) {
  console.error('Usage: repair-telegram-cards.mjs --ledger <dir> [--live]');
  process.exit(1);
}
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
  console.error('Telegram credentials are not configured');
  process.exit(1);
}

async function editTelegramPhoto({ messageId, story, card }) {
  const message = telegramMessage(story, siteUrl, { card });
  if (!message.upload) throw new Error('branded card upload missing');
  const form = new FormData();
  form.append('chat_id', env.TELEGRAM_CHAT_ID);
  form.append('message_id', String(messageId));
  form.append('media', JSON.stringify({
    type: 'photo',
    media: 'attach://photo',
    caption: message.caption,
    parse_mode: 'HTML'
  }));
  form.append('photo', new Blob([readFileSync(message.upload)], { type: 'image/png' }), `${story.slug}.png`);
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageMedia`, { method: 'POST', body: form });
  let body = {};
  try { body = await res.json(); } catch {}
  if (!res.ok || !body.ok) throw new Error(`Telegram editMessageMedia HTTP ${res.status}: ${String(body.description || 'not ok').slice(0, 160)}`);
  return body.result;
}

const files = readdirSync(ledgerDir).filter(f => f.endsWith('.json')).sort();
const targets = [];
for (const file of files) {
  const path = join(ledgerDir, file);
  let entry;
  try { entry = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
  const tg = entry.platforms?.telegram;
  if (tg?.status === 'sent' && tg?.kind === 'photo' && tg.remoteId) targets.push({ file, path, entry, tg });
}

console.log(`Telegram card repair: ${targets.length} raw-photo post(s) found`);
if (!live) {
  for (const x of targets) console.log(` - would repair ${x.entry.slug} message ${x.tg.remoteId}`);
  process.exit(0);
}

const failures = [];
for (const x of targets) {
  const { entry, tg, path } = x;
  try {
    const story = loadStory(entry.slug);
    const cards = await prepareCardAssets(story);
    if (!cards.ok) throw new Error(cards.error);
    const repaired = await editTelegramPhoto({ messageId: tg.remoteId, story, card: cards.forPlatform.telegram });
    entry.platforms.telegram = {
      ...tg,
      kind: 'card',
      repairedAt: new Date().toISOString(),
      repair: 'raw photo replaced in place with verified branded Nuvellum card'
    };
    delete entry.platforms.telegram.cardFallback;
    delete entry.platforms.telegram.error;
    entry.cards = {
      status: 'rendered',
      at: new Date().toISOString(),
      variant: cards.manifest?.variant ?? null,
      formats: Object.keys(cards.png || {})
    };
    writeFileSync(path, JSON.stringify(entry, null, 2) + '\n');
    console.log(` repaired ${entry.slug}: Telegram message ${repaired?.message_id ?? tg.remoteId}`);
  } catch (e) {
    failures.push(`${entry.slug}: ${e instanceof Error ? e.message : String(e)}`);
    console.error(` failed ${entry.slug}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
if (failures.length) {
  console.error(`\n${failures.length} repair(s) failed`);
  process.exit(1);
}
