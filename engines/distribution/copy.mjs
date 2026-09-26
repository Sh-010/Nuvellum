// Platform copy: deterministic templates built only from the article's own
// headline, dek and tags, optionally improved by a model. Every model output
// is length-checked and fact-grounded against the article; anything that
// fails falls back to the template. The template itself is grounded by
// construction (it quotes the article's own headline and dek).
import { PLATFORMS, platformLength } from './platforms.mjs';
import { checkGrounding } from '../shared/grounding.mjs';
import { complete, ProviderUnavailableError } from '../shared/providers/index.mjs';

const hashtag = (t) => '#' + String(t).replace(/[^A-Za-z0-9]/g, '');
const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function truncateWords(text, max) {
  const t = tidy(text);
  if ([...t].length <= max) return t;
  const cut = [...t].slice(0, Math.max(0, max - 1)).join('');
  return cut.replace(/\s+\S*$/, '') + '…';
}

export function templateCopy(story) {
  const tags = story.tags.slice(0, 2).map(hashtag).filter(h => h.length > 2);
  const x = (() => {
    const tail = `\n\n${story.url}`;
    const budget = 280 - 23 - 2;
    const withDek = `${story.title}\n\n${story.dek}`;
    const body = platformLength('x', withDek) <= budget ? withDek : truncateWords(story.title, budget);
    return body + tail;
  })();
  return {
    x,
    threads: `${story.title}\n\n${truncateWords(story.dek, 300)}\n\n${story.url}`,
    facebook: { message: `${story.title}\n\n${truncateWords(story.dek, 400)}`, link: story.url },
    instagram: `${story.title}\n\n${story.dek}\n\nFull story: link in bio.\n\n${tags.join(' ')} #Nuvellum`.trim(),
    tiktok: `${truncateWords(story.title, 150)} Full story on Nuvellum. ${tags.join(' ')} #news`.trim(),
    youtube: { title: truncateWords(story.title, 100), description: `${story.dek}\n\nRead the full story: ${story.url}\n\n#Shorts #Nuvellum` }
  };
}

function textOf(platform, value) {
  if (platform === 'facebook') return value?.message;
  if (platform === 'youtube') return `${value?.title}\n${value?.description}`;
  return value;
}

export function checkCopy(platform, value, story) {
  const problems = [];
  const text = textOf(platform, value);
  if (!tidy(text)) return ['empty'];
  const spec = PLATFORMS[platform];
  if (platformLength(platform, text) > spec.maxChars) problems.push(`over ${spec.maxChars} characters`);
  if (platform === 'youtube' && [...String(value.title || '')].length > spec.titleMax) problems.push('title over 100 characters');
  if (spec.linkInText && platform !== 'youtube' && !String(text).includes(story.url)) problems.push('missing article link');
  const source = `${story.title}\n${story.dek}\n${story.text}\n${story.url}`;
  const g = checkGrounding(String(text).replace(/https?:\/\/\S+/g, ' ').replace(/#\w+/g, ' '), source, { allow: ['Nuvellum', 'Shorts', 'TikTok'] });
  problems.push(...g.problems);
  return problems;
}

const SYSTEM = `You write social posts for Nuvellum, an independent international news publication.
Use ONLY facts in the ARTICLE. No new numbers, names or quotes. No hype ("this changes everything", "shocking"), no clickbait questions, no political persuasion or predictions. Attribute claims as the article does. Calm, precise, curious tone.`;

/**
 * @returns {Promise<{ copy: object, source: Record<string,'model'|'template'>, notes: string[] }>}
 */
export async function generateCopy(story, { env = process.env, platforms = Object.keys(PLATFORMS) } = {}) {
  const template = templateCopy(story);
  const copy = {}; const source = {}; const notes = [];
  let model = null;
  try {
    const r = await complete('social', {
      system: SYSTEM,
      json: true,
      prompt: `ARTICLE URL: ${story.url}\nHEADLINE: ${story.title}\nDEK: ${story.dek}\nARTICLE:\n${story.text.slice(0, 6000)}\n\nReturn JSON with keys: x (<=250 chars, must end with the URL), threads (<=450, include URL), facebook {message}, instagram (caption, end with "Full story: link in bio."), tiktok (caption <=150), youtube {title <=90, description including URL}.`
    }, env);
    model = JSON.parse(r.text.replace(/^```(json)?|```$/g, '').trim());
    notes.push(`model copy from ${r.provider}`);
  } catch (err) {
    notes.push(err instanceof ProviderUnavailableError ? 'no model configured/available: template copy' : `model output unusable (${err.message}): template copy`);
  }
  for (const p of platforms) {
    let candidate = model?.[p];
    if (p === 'facebook' && candidate) candidate = { message: candidate.message ?? candidate, link: story.url };
    const problems = candidate ? checkCopy(p, candidate, story) : ['no model copy'];
    if (candidate && problems.length === 0) { copy[p] = candidate; source[p] = 'model'; continue; }
    if (candidate) notes.push(`${p}: model copy rejected (${problems.join('; ')})`);
    const fallbackProblems = checkCopy(p, template[p], story);
    if (fallbackProblems.length) { notes.push(`${p}: template also failed (${fallbackProblems.join('; ')}), platform skipped`); continue; }
    copy[p] = template[p]; source[p] = 'template';
  }
  return { copy, source, notes };
}
