import { PLATFORMS, charCount } from './platforms.mjs';

// Collapse runs of spaces but keep paragraph breaks: collapsing every newline ran the headline into the dek
// ("...infringement case A federal jury...") on every platform.
const clean = (s) => String(s || '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// X counts every link as 23 characters (t.co), whatever its real length.
const X_LINK_LENGTH = 23;
export function platformLength(platform, text) {
  const s = String(text || '');
  return platform === 'x' ? charCount(s.replace(/https?:\/\/\S+/g, 'x'.repeat(X_LINK_LENGTH))) : charCount(s);
}

function truncate(text, max) {
  const s = clean(text);
  if (charCount(s) <= max) return s;
  const chars = [...s].slice(0, Math.max(1, max - 1)).join('');
  return chars.replace(/\s+\S*$/, '') + '…';
}

// Body, then a tail (tracked link, hashtags) that is never truncated. Truncating the whole post cut the link
// off long stories, and validation then dropped their X and Threads drafts entirely.
function compose(platform, body, tail) {
  return truncate(body, PLATFORMS[platform].maxChars - platformLength(platform, tail)) + tail;
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
  const body = story.dek ? story.title + '\n\n' + story.dek : story.title;
  return {
    x: compose('x', body, '\n\n' + links.x),
    threads: compose('threads', body, '\n\n' + links.threads),
    facebook: compose('facebook', body, '\n\nRead: ' + links.facebook),
    linkedin: compose('linkedin', body, '\n\nRead the full story: ' + links.linkedin + '\n\n#Nuvellum'),
    instagram: compose('instagram', body, '\n\nRead the full story via Nuvellum.\n\n' + [...tags, '#Nuvellum'].join(' '))
  };
}

export function templateVideoCopy(story) {
  const tags = story.tags.slice(0, 2).map(tag).filter(Boolean);
  const links = Object.fromEntries(Object.keys(PLATFORMS).map(p => [p, trackedUrl(story, p)]));
  return {
    x: compose('x', story.title + '\n\nWatch the short, then read the full story.', '\n\n' + links.x),
    facebook: compose('facebook', story.title, '\n\nWatch the reel, then read the full story: ' + links.facebook),
    instagram: compose('instagram', story.title, '\n\n' + [...tags, '#Nuvellum', '#Reels'].join(' ')),
    tiktok: compose('tiktok', story.title + '\n\n' + truncate(story.dek, 320), '\n\n' + [...tags, '#Nuvellum', '#News'].join(' ')),
    youtube: {
      title: truncate(story.title, PLATFORMS.youtube.titleMax),
      description: compose('youtube', story.dek, '\n\nRead the full story: ' + links.youtube + '\n\n#Shorts #Nuvellum')
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
  if (platformLength(platform, text) > spec.maxChars) problems.push('over ' + spec.maxChars + ' characters');
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
