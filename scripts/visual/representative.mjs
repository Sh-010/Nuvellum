// Representative visuals: when no photograph of the story itself qualifies, find a legitimate image of the
// story's primary subject (the person, organisation, institution, event or place it is about) before falling
// back to a text-led layout.
//
// Sources: the subject's Wikidata item (its canonical image, P18), Wikimedia Commons files that are tagged as
// depicting it (P180) or filed in its Commons category, and, for events, files naming the event. Every
// candidate passes the unchanged acquisition checks (core.mjs visualCandidateProblems: licence allowlist,
// credit, Commons source page, size, landscape ratio, no remote SVG) and then the editorial rules below.
// The caption says whose image it is and that it is not of the events reported.
import { visualCandidateProblems, editorialVisualScore } from './core.mjs';
import { normalizeCommonsPage } from './wikimedia.mjs';

const UA = 'NuvellumVisualEngine/1.0 (https://www.nuvellum.news; representative open-licence image discovery)';
const WD = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';

// Wikidata classes (P31) of things a story can be "about". Anything else (concepts, taxa, songs,
// disambiguation pages, name items) is never a subject.
const KIND = {
  person: ['Q5'],
  institution: ['Q3918', 'Q902104', 'Q875538', 'Q15936437', 'Q23002054', 'Q38723', 'Q615150', 'Q62078547', 'Q3354859', 'Q1371037', 'Q33506', 'Q3152824'],
  organisation: ['Q43229', 'Q4830453', 'Q783794', 'Q891723', 'Q6881511', 'Q327333', 'Q2659904', 'Q17505024', 'Q1752939', 'Q2178147', 'Q163740', 'Q48204', 'Q15911314', 'Q1664720', 'Q7210356', 'Q210167', 'Q1762059', 'Q1331793', 'Q18388277', 'Q1058914', 'Q15265344', 'Q5621421', 'Q167037', 'Q2085381', 'Q7278', 'Q476028', 'Q847017', 'Q12973014', 'Q1320047'],
  event: ['Q57305', 'Q11483816', 'Q1656682', 'Q2761147', 'Q464980', 'Q1569406', 'Q15275719', 'Q625994', 'Q132241', 'Q18608583', 'Q27020041'],
  place: ['Q515', 'Q1549591', 'Q486972', 'Q41176', 'Q811979', 'Q2221906', 'Q1370598', 'Q12280', 'Q483110', 'Q24354', 'Q1007870', 'Q16970', 'Q44539', 'Q1248784'],
  // Creative works count only when the item names someone from the story (the right "Icebreaker").
  work: ['Q7725634', 'Q8261', 'Q47461344', 'Q11424', 'Q5398426', 'Q7889', 'Q571', 'Q1004', 'Q21191270', 'Q24856']
};
const kindOfClass = new Map(Object.entries(KIND).flatMap(([k, ids]) => ids.map((id) => [id, k])));

// Nothing sensational is ever "representative".
export const RESTRAINT_RE = /\b(police|arrest(ed)?|mugshot|crime|criminal|murder|killing|shooting|guns?|weapons?|blood|victims?|riot|protest(ers)?|demonstration|prison|jail|handcuffs?|court ?room|trial|funeral|crash|wreck|fire|burning|explosion|war|soldiers?|military|assault|rape|abuse|scandal|meme|caricature|cartoon|demolition|collapse|disaster)\b/i;
// A person's photo should show that person, not a meeting or crowd that suggests another occasion.
const OTHER_PEOPLE_RE = /\b(with|and|meets?|meeting|alongside|greets|welcomes|receives?|shaking hands|press conference|rally|debate|signing|crowd|interview|interviewed|by)\b|,|&/i;
// For institutions, organisations and events: "Name at CinemaCon", "Name walking …" are photos of a person.
const PERSON_SHOT_RE = /^[A-Z][a-zà-ÿ'’.-]+(?: [A-Z][a-zà-ÿ'’.-]+){1,3}(?:,| at | walking | on | with | speaking| arrives)/;
const VENUE_HINT_RE = /\b(banner|banners|sign|signage|stage|hall|venue|entrance|archway|building|headquarters|hq|campus|aerial|tower|library|quad|facade|façade|exterior|insignia|logo|seal)\b/i;
// Legal/crime stories may only show the institution or place itself: buildings, campus, grounds, landscape.
export const INSTITUTION_VIEW_RE = /\b(campus|aerial|view|hall|building|tower|library|quad|chapel|facade|exterior|gate|gorge|lake|headquarters|hq|museum|clock|arch|entrance|skyline|panorama|street|plaza)\b/i;
const PEOPLE_SCENE_RE = /\b(graduation|commencement|students?|student's|crowd|ceremony|team|class of|party|dorm|dormitory|room|rooms|bedroom|portrait|people|fans|players?|reunion|parade|celebration)\b/i;
const PEOPLE_SCENE_STRICT_RE = /\b(dorm|dormitory|bedroom|room|party|graduation|commencement)\b/i;
const MEETING_RE = /\b(with|meets?|meeting|bilateral|alongside|greets|welcomes|interview(ed)?|talks with|summit|delegation|press conference)\b/i;
// A person shown at a specific occasion implies that occasion; plain, neutral shots come first.
const OCCASION_RE = /\b(visits?|presents?|arrives?|delivers?|remarks|signs?|tours?|speaks?|speaking|attends?|rally|briefing|medal|summit|church|hurricane|memorial|inauguration|campaign|trip|travels?|state visit)\b/i;
// Legal/crime stories: never put a person next to allegations; institutions and places only.
export const LEGAL_RE = /\b(alleged|allegations?|prosecutors?|charged|charges|indicted|lawsuit|sued|trial|court|rape|assault|murder|abuse|convicted|investigation|police)\b/i;

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'over', 'about', 'more', 'than', 'they', 'their', 'have', 'has', 'will', 'says', 'said', 'american', 'new', 'united', 'states', 'book', 'film', 'game', 'video', 'single', 'series', 'show', 'company', 'born', 'first']);
const terms = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)));

/** Subject names to try, most central first: tags named in the headline (a surname counts), then the rest. */
export function subjectCandidates(article) {
  const title = String(article?.title || '').toLowerCase();
  const tags = (Array.isArray(article?.tags) ? article.tags : []).map((t) => String(t).trim()).filter((t) => t && /^[A-Z0-9]/.test(t) && t.length >= 3 && !/^(USA|UK|US|EU|Tech|AI)$/.test(t));
  const pos = (t) => {
    const full = title.indexOf(t.toLowerCase());
    if (full >= 0) return full;
    const last = t.split(/\s+/).pop().toLowerCase();
    return t.includes(' ') && last.length >= 4 ? title.search(new RegExp(`\\b${last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)) : -1;
  };
  const inTitle = tags.filter((t) => pos(t) >= 0).sort((a, b) => pos(a) - pos(b));
  return [...new Set([...inTitle, ...tags])].slice(0, 5);
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  return res.json();
}
const claimIds = (e, p) => (e?.claims?.[p] || []).map((c) => c?.mainsnak?.datavalue?.value).map((v) => (v && typeof v === 'object' ? v.id : v)).filter(Boolean);
const kindOf = (e) => claimIds(e, 'P31').map((c) => kindOfClass.get(c)).find(Boolean) || null;

/**
 * Resolve a subject name to the Wikidata item the story is about, or null. Only exact label/alias matches of
 * a subject class. Among several, the description must share a meaningful term with the story (NASA the agency,
 * not the plant genus); a person with a unique exact name needs no such overlap.
 */
export async function resolveEntity(name, storyText, { fetchImpl = fetch } = {}) {
  const search = await getJson(`${WD}?${new URLSearchParams({ action: 'wbsearchentities', format: 'json', language: 'en', type: 'item', limit: '7', search: name })}`, fetchImpl);
  const hits = (search.search || []).filter((h) => String(h.label).toLowerCase() === name.toLowerCase() || (h.aliases || []).some((a) => a.toLowerCase() === name.toLowerCase()) || String(h.match?.text || '').toLowerCase() === name.toLowerCase());
  if (!hits.length) return null;
  const got = await getJson(`${WD}?${new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: hits.map((h) => h.id).join('|'), props: 'claims|labels|descriptions|aliases', languages: 'en' })}`, fetchImpl);
  const story = terms(storyText), storyLower = String(storyText).toLowerCase();
  const items = hits.map((h, rank) => {
    const e = got.entities?.[h.id];
    if (!e) return null;
    const label = e.labels?.en?.value || h.label || name;
    const desc = e.descriptions?.en?.value || h.description || '';
    const aliases = (e.aliases?.en || []).map((a) => a.value);
    let overlap = 0;
    for (const t of terms(desc)) if (story.has(t)) overlap++;
    return { e, rank, label, desc, kind: kindOf(e), exactCase: label === name || aliases.includes(name), overlap };
  }).filter((x) => x && x.kind);
  const eligible = items.filter((x) => {
    if (x.kind === 'work') return /\bby ([A-Z][\w'’.-]+(?: [A-Z][\w'’.-]+)*)/.test(x.desc) && storyLower.includes(/\bby ([A-Z][\w'’.-]+(?: [A-Z][\w'’.-]+)*)/.exec(x.desc)[1].toLowerCase());
    if (x.overlap > 0) return true;
    if (x.kind === 'person') return items.filter((y) => y.kind === 'person').length === 1;
    return x.exactCase && items.filter((y) => y.kind !== 'work').length === 1;
  });
  eligible.sort((a, b) => (b.overlap - a.overlap) || (b.exactCase - a.exactCase) || (a.rank - b.rank));
  const best = eligible[0];
  if (!best) return null;
  const e = best.e;
  const aliases = (e.aliases?.en || []).map((a) => a.value).filter((a) => a.length >= 4 && a.length <= 24 && /^[A-Z]/.test(a));
  return { id: e.id, name, label: best.label, aliases, description: best.desc, kind: best.kind, images: claimIds(e, 'P18'), category: claimIds(e, 'P373')[0] || '' };
}

async function commonsFiles(params, fetchImpl) {
  const q = new URLSearchParams({ action: 'query', format: 'json', origin: '*', prop: 'imageinfo|info|categories', inprop: 'url', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600', cllimit: 'max', ...params });
  const data = await getJson(`${COMMONS}?${q}`, fetchImpl);
  return Object.values(data?.query?.pages || {}).map(normalizeCommonsPage).filter(Boolean);
}
const search = (gsrsearch, fetchImpl, limit = 40) => commonsFiles({ generator: 'search', gsrnamespace: '6', gsrlimit: String(limit), gsrsearch }, fetchImpl);

/** Candidate images of the entity: canonical image, files depicting it, its category, and (events) files naming it. */
export async function entityImages(entity, { fetchImpl = fetch } = {}) {
  const out = new Map();
  const add = (list, via) => { for (const c of list) if (!out.has(c.sourcePage)) out.set(c.sourcePage, { ...c, via }); };
  if (entity.images.length) add(await commonsFiles({ titles: entity.images.slice(0, 3).map((f) => `File:${f}`).join('|') }, fetchImpl), 'canonical');
  add(await search(`haswbstatement:P180=${entity.id} filetype:bitmap`, fetchImpl, 50), 'depicts');
  // People: official and portrait photographs first; they rarely rank in the first page of "depicts" results.
  if (entity.kind === 'person') add(await search(`haswbstatement:P180=${entity.id} (portrait OR official) filetype:bitmap`, fetchImpl, 30), 'depicts');
  if (entity.category) add(await search(`incategory:"${entity.category}" filetype:bitmap`, fetchImpl), 'category');
  if (entity.kind === 'event') add(await search(`intitle:"${entity.label}" filetype:bitmap`, fetchImpl), 'named');
  return [...out.values()];
}

/** The file is visibly about the entity: canonical, or the name in the file title. */
export function aboutEntity(candidate, entity) {
  if (candidate.via === 'canonical') return true;
  const title = String(candidate.title || '').toLowerCase();
  const names = [entity.label, entity.name, ...(entity.aliases || []), entity.kind === 'person' ? String(entity.label).split(' ').pop() : ''].filter((n) => n && n.length >= 3);
  return names.some((n) => title.includes(n.toLowerCase()));
}

/** Editorial rules on top of the unchanged technical/licence checks; returns a reason when rejected. */
export function representativeProblem(c, entity, { legal = false } = {}) {
  const tech = visualCandidateProblems(c);
  if (tech.length) return tech[0];
  if (!aboutEntity(c, entity)) return 'does not name the subject';
  const text = `${c.title} ${c.description}`;
  if (RESTRAINT_RE.test(text)) return 'sensational or conflict imagery';
  if (entity.kind === 'person' && c.via !== 'canonical' && OTHER_PEOPLE_RE.test(String(c.title))) return 'shows other people or an occasion';
  if (entity.kind === 'person' && OCCASION_RE.test(String(c.title))) return 'a specific occasion (visit, speech, ceremony)';
  if (entity.kind === 'person' && c.via !== 'canonical' && MEETING_RE.test(String(c.description))) return 'described as a meeting with others';
  // Several people in one frame: "(left) … (right)" descriptions, or names joined in the title ("Trump-Vance").
  if (entity.kind === 'person' && (/\((left|right|centre|center)\)/i.test(String(c.description)) || /\p{Lu}\p{Ll}+-\p{Lu}\p{Ll}+/u.test(String(c.title)))) return 'shows more than one person';
  if (entity.kind !== 'person' && PERSON_SHOT_RE.test(String(c.title))) return 'a photo of a person, not of the subject';
  if (legal && (PEOPLE_SCENE_RE.test(String(c.title)) || PEOPLE_SCENE_STRICT_RE.test(String(c.description)) || !INSTITUTION_VIEW_RE.test(c.title))) return 'legal story: only buildings, grounds or landscape views';
  return null;
}

export function selectRepresentative(candidates, entity, { minScore = 64, legal = false } = {}) {
  const ranked = [];
  for (const c of candidates) {
    if (representativeProblem(c, entity, { legal })) continue;
    let score = editorialVisualScore(c, { mode: 'photo', title: `${entity.label} ${entity.description}`, entities: [entity.label] });
    if (c.via === 'canonical') score += 12;
    if (c.via === 'depicts') score += 8;
    if (entity.kind !== 'person' && VENUE_HINT_RE.test(c.title)) score += 10;
    if (entity.kind === 'event' && /\b(sign|signage|banners?)\b/i.test(c.title)) score += 6; // official event branding first
    if (entity.kind === 'organisation' && /\b(logo|logomark|wordmark|emblem)\b/i.test(c.title)) score -= 12; // photographs before logos
    // Official photography (government and institutional photographers) reads as restrained and neutral.
    if (entity.kind === 'person' && /\b(white house|official|government|u\.s\. (department|embassy|mission)|nasa|european (commission|parliament)|kremlin)\b/i.test(String(c.credit))) score += 10;
    if (entity.kind === 'person' && /\b(rally|stage|concert|convention|conference|con\b)/i.test(String(c.description))) score -= 6;
    // People change: a recent photograph represents them better than a decade-old one.
    if (entity.kind === 'person') {
      const years = `${c.title} ${c.description}`.match(/\b(19[5-9]\d|20[0-4]\d)\b/g);
      if (years) score += Math.max(0, Math.min(6, Math.round((Math.max(...years.map(Number)) - 2012) / 2)));
    }
    // An institution is better shown by its campus or grounds than by one utility building.
    if ((entity.kind === 'institution' || entity.kind === 'place') && /\b(campus|aerial|quad|panorama|skyline|hall|library|tower)\b/i.test(String(c.title))) score += 6;
    if (entity.kind === 'institution' && /\b(creek|gorge|falls|lake|trail|woods|river)\b/i.test(String(c.title))) score -= 8; // a nature scene does not say which institution
    if (entity.kind === 'person' && /^[\p{L} .'’-]+(?:\s*\(\d+\))?(?:\s+\d{1,4})?\.(jpe?g|png|webp)$/iu.test(String(c.title))) score += 6; // plain named portrait
    if (entity.kind !== 'person' && / and [A-Z]/.test(String(c.title))) score -= 12; // shared with another subject
    if (String(c.title).length > 70) score -= 8; // a specific scene rather than the subject
    if (entity.kind === 'person' && /\b(portrait|official)\b/i.test(c.title)) score += 6;
    ranked.push({ ...c, representativeScore: score });
  }
  ranked.sort((a, b) => b.representativeScore - a.representativeScore);
  return { best: ranked.find((c) => c.representativeScore >= minScore) || null, ranked };
}

export const FALLBACK_TYPE = { person: 'representative-person', institution: 'representative-institution', event: 'representative-event', place: 'representative-place', organisation: 'representative-organisation', work: 'representative-work' };

/** The caption says what the image shows and that it is not of the events reported. */
export function representativeCaption(desc, entity) {
  const d = String(desc).replace(/[.\s]+$/, '');
  return `File photo: ${d}. Image of ${entity.label}, not of the events reported.`.slice(0, 280);
}

/**
 * Try the story's subjects in headline order. Legal and crime stories skip people entirely (institutions and
 * places only). Returns the first subject with a qualifying image.
 */
export async function findRepresentative(article, { fetchImpl = fetch, bodyText = '' } = {}) {
  const storyText = [article.title, article.dek, ...(article.tags || []), article.section, bodyText].join(' ');
  const legal = LEGAL_RE.test(`${article.title} ${article.dek}`);
  const tried = [];
  for (const name of subjectCandidates(article)) {
    let entity = null;
    try { entity = await resolveEntity(name, storyText, { fetchImpl }); } catch (e) { tried.push({ name, error: e.message }); continue; }
    if (!entity) { tried.push({ name, entity: 'no matching subject item' }); continue; }
    if (legal && entity.kind === 'person') { tried.push({ name, entity: `${entity.id} ${entity.label}`, skipped: 'legal story: no person imagery' }); continue; }
    let candidates = [];
    try { candidates = await entityImages(entity, { fetchImpl }); } catch (e) { tried.push({ name, error: e.message }); continue; }
    const pick = selectRepresentative(candidates, entity, { legal });
    tried.push({ name, entity: `${entity.id} ${entity.label} (${entity.kind})`, candidates: candidates.length, top: pick.ranked.slice(0, 3).map((c) => `${c.title} [${c.via}] ${c.representativeScore}`) });
    if (pick.best) return { outcome: 'selected', candidate: pick.best, entity, fallbackType: FALLBACK_TYPE[entity.kind], tried };
  }
  return { outcome: 'none', tried };
}
