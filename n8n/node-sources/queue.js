
const items = $input.all();

function categoriesOf(item) {
  const c = item.json.categories ?? item.json.category ?? [];
  return (Array.isArray(c) ? c : [c]).map(x => String((x && (x._ || x.term)) || x || '').toLowerCase()).join(' ');
}
function hintFor(item) {
  const link = String(item.json.link || '');
  const host = hostOf(link);
  const path = pathOf(link);
  const cats = categoriesOf(item);

  if (host.includes('espn.com') || path.startsWith('/sport/') || path.startsWith('/sports/')) return 'Sports';
  if (host.includes('techcrunch.com') || host.includes('theverge.com') || host.includes('arstechnica.com')) return 'Technology';
  if (host.includes('nasa.gov') || host.includes('sciencedaily.com')) return 'Science';
  if (host.includes('fbi.gov') || /\b(crime|policing|criminal|police)\b/.test(cats) || path.includes('/crime/') || path.includes('us-crime')) return 'Crime';
  if (host.includes('cnbc.com') || host.includes('fortune.com') || /business|markets|economy|finance/.test(cats) || path.includes('/news/business')) return 'Business';
  if (host.includes('animenewsnetwork.com')) return 'Anime';
  if (host.includes('ign.com') || host.includes('polygon.com') || host.includes('gamesindustry.biz') || path.startsWith('/games/')) return 'Gaming';
  if (host.includes('variety.com') || host.includes('deadline.com') || path.startsWith('/film/') || /\b(film|television|tv)\b/.test(cats)) return 'Film & TV';
  if (/science|environment/.test(cats) || path.includes('/news/science')) return 'Science';
  if (path.includes('/news/technology')) return 'Technology';
  if (/culture|arts|music|books|theatre|stage/.test(cats) || path.startsWith('/culture/') || path.includes('entertainment')) return 'Culture';
  return 'World';
}

// Formats that are not standalone text articles: live blogs, video/audio, galleries, podcasts, newsletters.
const blockedPaths = [
  /\/video(s)?\//i, /\/av\//i, /\/watch\//i, /\/live(blog)?s?\//i, /\/live-\d+/i, /\/live-news\//i, /\/live-updates?\//i, /-live-updates?\b/i,
  /\/liveblog\//i, /\/audio\//i, /\/sounds\//i, /\/podcasts?\b/i, /\/galler(y|ies)\//i, /\/in-pictures\//i,
  /\/pictures\//i, /\/photos?\//i, /\/slideshows?\//i, /\/newsletters?\//i, /\/quiz(zes)?\//i
];
const blockedTitles = /^(live|watch|video|listen|podcast|gallery|photos?|in pictures|quiz)\b|\blive(:| updates| blog)\b|\bas it happened\b|\bin pictures\b|\bphotos:|\bvideo:/i;

function pickLink(json) {
  const atomLink = json?.['atom:link'];
  const atomHref =
    Array.isArray(atomLink) ? atomLink.find(x => x && typeof x === 'object' && x.href)?.href :
    atomLink && typeof atomLink === 'object' ? atomLink.href :
    '';
  for (const value of [json?.link, json?.url, json?.permalink, json?.guid, json?.id, atomHref]) {
    const s = String((value && value._) || value || '').trim();
    if (/^https?:\/\//i.test(s)) return s;
  }
  return '';
}
function timeOf(json) {
  const t = Date.parse(json.isoDate || json.pubDate || '');
  return Number.isFinite(t) ? t : 0;
}

// Newest first; items without a usable timestamp sink to the bottom instead of sorting as "now".
items.sort((a, b) => timeOf(b.json) - timeOf(a.json));

const seen = new Set();
const candidates = [];
for (const item of items) {
  if (item.json.error) continue; // failed feed (continueOnFail)
  const raw = pickLink(item.json);
  if (!raw || blockedPaths.some(re => re.test(raw))) continue;
  if (blockedTitles.test(String(item.json.title || '').trim())) continue;

  // Normalize downstream shape so every later node can safely read item.json.link.
  item.json.link = canonicalSourceUrl(raw);
  const key = dedupeKey(raw);
  if (!key || seen.has(key)) continue;
  seen.add(key);
  item.json._sourceHost = hostOf(raw);
  item.json._sectionHint = hintFor(item);
  if (!item.json._sourceHost) continue;
  candidates.push(item);
}

// First pass: favor both source-domain and section diversity.
const selected = [];
const usedHosts = new Set();
const usedSections = new Set();
for (const item of candidates) {
  const host = item.json._sourceHost;
  const section = item.json._sectionHint;
  if (usedHosts.has(host) || usedSections.has(section)) continue;
  selected.push(item);
  usedHosts.add(host);
  usedSections.add(section);
  if (selected.length >= 3) break;
}

// Second pass: fill remaining slots with unique domains, even if section repeats.
if (selected.length < 3) {
  for (const item of candidates) {
    if (selected.includes(item)) continue;
    const host = item.json._sourceHost;
    if (usedHosts.has(host)) continue;
    selected.push(item);
    usedHosts.add(host);
    if (selected.length >= 3) break;
  }
}

return selected.slice(0, 3);
