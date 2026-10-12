import { parseArticle } from './article-rules.mjs';
import { readingTime } from '../../src/lib/reading-time.js';

/** Conservative metadata repairs before the existing review/publication gate.
 * Never changes risk, clearance, source URLs, dates, slugs or body text.
 */
export function preflightArticle(src) {
  const { data, body } = parseArticle(src, 'incoming article');
  if (data.origin !== 'automation') return src;
  let section = data.section;
  const subject = String(data.title || '');
  if (/\b(anime|manga)\b/i.test(subject)) section = 'Anime';
  else if (/\b(comics?|broadway|theatre|theater|self-portrait|auction|concert|musician|singer|album|residency shows)\b/i.test(subject) && ['Gaming','Technology','Film & TV'].includes(section)) section = 'Culture';
  else if (/\b(films?|movies?|cinema|filmmakers?|directors?|actors?|actresses?|adaptations?|television|showrunner|netflix|hbo|streaming)\b/i.test(subject) && ['Gaming','Technology','Science'].includes(section)) section = 'Film & TV';
  const values = { section, readingTime: readingTime(body) };
  const end = src.indexOf('\n---', 3);
  const header = src.slice(0, end).split('\n').map(line => {
    const key = line.match(/^([A-Za-z][A-Za-z0-9]*):/)?.[1];
    return key in values ? `${key}: ${JSON.stringify(values[key])}` : line;
  }).join('\n');
  return header + src.slice(end);
}
