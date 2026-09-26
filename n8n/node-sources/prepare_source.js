
const extracted = $json;
const source = $('Process One by One').item.json;

function clean(value) {
  if (!value) return '';
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&#x27;|&rsquo;|&lsquo;/gi,"'")
    .replace(/\s+/g,' ')
    .trim();
}
function words(s){ return clean(s).split(/\s+/).filter(Boolean).length; }

const registry = [
  [/(^|\.)bbc\.co\.uk$|(^|\.)bbc\.com$/, 'BBC', null],
  [/aljazeera\.com$/, 'Al Jazeera', 'World'],
  [/france24\.com$/, 'France 24', 'World'],
  [/(^|\.)dw\.com$/, 'Deutsche Welle', 'World'],
  [/cnbc\.com$/, 'CNBC', 'Business'],
  [/fortune\.com$/, 'Fortune', 'Business'],
  [/techcrunch\.com$/, 'TechCrunch', 'Technology'],
  [/theverge\.com$/, 'The Verge', 'Technology'],
  [/arstechnica\.com$/, 'Ars Technica', 'Technology'],
  [/nasa\.gov$/, 'NASA', 'Science'],
  [/sciencedaily\.com$/, 'ScienceDaily', 'Science'],
  [/fbi\.gov$/, 'FBI', 'Crime'],
  [/espn\.com$/, 'ESPN', 'Sports'],
  [/variety\.com$/, 'Variety', 'Film & TV'],
  [/deadline\.com$/, 'Deadline', 'Film & TV'],
  [/animenewsnetwork\.com$/, 'Anime News Network', 'Anime'],
  [/ign\.com$/, 'IGN', 'Gaming'],
  [/polygon\.com$/, 'Polygon', 'Gaming'],
  [/gamesindustry\.biz$/, 'GamesIndustry.biz', 'Gaming'],
  [/theguardian\.com$/, 'The Guardian', null],
];
function sourceInfo(link, sectionHint) {
  const host = hostOf(link);
  const path = pathOf(link);
  let sourceName = '';
  let hint = sectionHint || '';
  for (const [re, name, forced] of registry) {
    if (re.test(host)) { sourceName = name; if (forced) hint = forced; break; }
  }
  if (/bbc\.(co\.uk|com)$/.test(host)) {
    if (path.startsWith('/sport/')) hint = 'Sports';
    else if (path.includes('/news/business')) hint = 'Business';
    else if (path.includes('/news/technology')) hint = 'Technology';
    else if (path.includes('/news/science')) hint = 'Science';
    else if (path.includes('/culture') || path.includes('entertainment')) hint = 'Culture';
  }
  if (host.includes('aljazeera.com') && path.startsWith('/sports/')) hint = 'Sports';
  if (host.includes('theguardian.com')) {
    if (path.startsWith('/film/')) hint = 'Film & TV';
    else if (path.startsWith('/games/')) hint = 'Gaming';
    else if (path.startsWith('/culture/') || path.startsWith('/music/') || path.startsWith('/books/') || path.startsWith('/stage/') || path.startsWith('/artanddesign/')) hint = 'Culture';
    else if (path.includes('/crime/') || path.includes('us-crime')) hint = 'Crime';
  }
  // Unknown outlet: a readable host label, never the placeholder "Source".
  if (!sourceName) sourceName = host || 'the original publisher';
  return { sourceName, sourceSectionHint: hint || 'World', sourceHost: host };
}

// Structured articleBody (JSON-LD) is the most reliable single-story text. Page-level
// <main>/<article> text can include related-story teasers, so it is only a fallback.
const structured = [];
function visit(v) {
  if (!v) return;
  if (Array.isArray(v)) return v.forEach(visit);
  if (typeof v !== 'object') return;
  if (typeof v.articleBody === 'string') structured.push(clean(v.articleBody));
  Object.values(v).forEach(x => { if (x && typeof x === 'object') visit(x); });
}
const blocks = Array.isArray(extracted.jsonLdText) ? extracted.jsonLdText : (extracted.jsonLdText ? [extracted.jsonLdText] : []);
for (const block of blocks) {
  try { visit(JSON.parse(String(block).trim())); } catch {}
}
structured.sort((a,b) => words(b) - words(a));

const title = clean(source.title);
const titleTerms = title.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 5);
// Guard against pages whose extracted text is about a different story.
function onTopic(text) {
  if (titleTerms.length < 2) return true;
  const head = text.slice(0, 2500).toLowerCase();
  return titleTerms.filter(w => head.includes(w)).length >= Math.min(2, titleTerms.length);
}
const ordered = [
  { kind: 'jsonld', text: structured[0] || '' },
  { kind: 'article', text: clean(extracted.articleText) },
  { kind: 'main', text: clean(extracted.mainText) },
  { kind: 'rss-full', text: clean(source['content:encoded']) },
  { kind: 'rss', text: clean(source.content) },
  { kind: 'rss-snippet', text: clean(source.contentSnippet || source.description) }
].filter(c => c.text);

const picked =
  ordered.find(c => words(c.text) >= 180 && onTopic(c.text)) ||
  ordered.filter(c => onTopic(c.text)).sort((a,b) => words(b.text) - words(a.text))[0] ||
  { kind: 'none', text: '' };

// Very long page text is usually page chrome plus related stories; cap what the model sees.
const articleText = picked.text.split(/\s+/).slice(0, 2200).join(' ');
const sourceLink = canonicalSourceUrl(source.link);
const meta = sourceInfo(sourceLink, source._sectionHint);
const wc = words(articleText);
return { json: {
  sourceTitle: title,
  sourceLink,
  publishedAt: source.isoDate || source.pubDate || '',
  articleText,
  sourceTextKind: picked.kind,
  sourceWordCount: wc,
  sourceReady: wc >= 180,
  ...meta
}};
