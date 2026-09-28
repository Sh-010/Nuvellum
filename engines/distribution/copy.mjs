import { PLATFORMS, charCount } from './platforms.mjs';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function truncate(text, max) {
  const s = clean(text);
  if (charCount(s) <= max) return s;
  const chars = [...s].slice(0, Math.max(1, max - 1)).join('');
  return chars.replace(/\s+\S*$/, '') + '…';
}

function tag(value) {
  const t = String(value || '').replace(/[^\p{L}\p{N}]/gu, '');
  return t ? '#' + t : '';
}

export function trackedUrl(story, platform) {
  const url = new URL(story.url);
  url.searchParams.set('utm_source', platform);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'article');
  url.searchParams.set('utm_content', story.slug);
  return url.toString();
}

export function templateFeedCopy(story) {
  const tags = story.tags.slice(0, 2).map(tag).filter(Boolean);
  const links = Object.fromEntries(Object.keys(PLATFORMS).map(p => [p, trackedUrl(story, p)]));
  const xTail = '\n\n' + links.x;
  const xBodyBudget = Math.max(40, PLATFORMS.x.maxChars - charCount(xTail));
  const xBodyCandidate = story.dek ? story.title + '\n\n' + story.dek : story.title;
  return {
    x: truncate(xBodyCandidate, xBodyBudget) + xTail,
    threads: truncate(story.title + '\n\n' + story.dek + '\n\n' + links.threads, PLATFORMS.threads.maxChars),
    facebook: truncate(story.title + '\n\n' + story.dek + '\n\nRead: ' + links.facebook, PLATFORMS.facebook.maxChars),
    linkedin: truncate(story.title + '\n\n' + story.dek + '\n\nRead the full story: ' + links.linkedin + '\n\n#Nuvellum', PLATFORMS.linkedin.maxChars),
    instagram: truncate(story.title + '\n\n' + story.dek + '\n\nRead the full story via Nuvellum.\n\n' + [...tags, '#Nuvellum'].join(' '), PLATFORMS.instagram.maxChars)
  };
}

export function templateVideoCopy(story) {
  const tags = story.tags.slice(0, 2).map(tag).filter(Boolean);
  const links = Object.fromEntries(Object.keys(PLATFORMS).map(p => [p, trackedUrl(story, p)]));
  return {
    x: truncate(story.title + '\n\nWatch the short, then read the full story: ' + links.x, PLATFORMS.x.maxChars),
    facebook: truncate(story.title + '\n\nWatch the reel, then read the full story: ' + links.facebook, PLATFORMS.facebook.maxChars),
    instagram: truncate(story.title + '\n\n' + [...tags, '#Nuvellum', '#Reels'].join(' '), PLATFORMS.instagram.maxChars),
    tiktok: truncate(story.title + '\n\n' + truncate(story.dek, 320) + '\n\n' + [...tags, '#Nuvellum', '#News'].join(' '), PLATFORMS.tiktok.maxChars),
    youtube: {
      title: truncate(story.title, PLATFORMS.youtube.titleMax),
      description: truncate(story.dek + '\n\nRead the full story: ' + links.youtube + '\n\n#Shorts #Nuvellum', PLATFORMS.youtube.maxChars)
    }
  };
}

function textForValidation(platform, value) {
  if (platform === 'youtube') return String(value?.title || '') + '\n' + String(value?.description || '');
  return String(value || '');
}

export function validateCopy(platform, value, story) {
  const spec = PLATFORMS[platform];
  const problems = [];
  if (!spec) return ['unknown platform'];
  const text = textForValidation(platform, value);
  if (!clean(text)) problems.push('empty');
  if (charCount(text) > spec.maxChars) problems.push('over ' + spec.maxChars + ' characters');
  if (platform === 'youtube' && charCount(value?.title) > spec.titleMax) problems.push('title over ' + spec.titleMax + ' characters');
  if (spec.linkInText) {
    const expected = trackedUrl(story, platform);
    if (!text.includes(expected)) problems.push('missing tracked article link');
  }
  if (/\b(shocking|you won'?t believe|this changes everything|must see|game[- ]changer)\b/i.test(text)) problems.push('sensational phrasing');
  return problems;
}

function checked(source, story, platforms) {
  const copy = {};
  const notes = [];
  for (const platform of platforms) {
    const value = source[platform];
    const problems = validateCopy(platform, value, story);
    if (problems.length) { notes.push(platform + ': skipped (' + problems.join('; ') + ')'); continue; }
    copy[platform] = value;
  }
  return { copy, notes };
}

export function generateFeedCopy(story, platforms = Object.keys(PLATFORMS).filter(p => PLATFORMS[p].feed)) {
  return checked(templateFeedCopy(story), story, platforms);
}

export function generateVideoCopy(story, platforms = Object.keys(PLATFORMS).filter(p => PLATFORMS[p].video)) {
  return checked(templateVideoCopy(story), story, platforms);
}
