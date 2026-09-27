// Visual brief: a structured description of what an article's artwork must (and must not)
// show, derived from the whole article, not just the headline. Deterministic, so every
// image can be regenerated and audited from the same brief (briefHash).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DIRECTION = JSON.parse(readFileSync(fileURLToPath(new URL('../../docs/visual-direction.json', import.meta.url)), 'utf8'));

const STOP = new Set(['The', 'A', 'An', 'And', 'Or', 'But', 'In', 'On', 'At', 'To', 'For', 'Of', 'As', 'By', 'With', 'From', 'After', 'Before', 'Over', 'Amid', 'Why', 'How', 'What', 'When', 'Who', 'This', 'That', 'It', 'Its', 'His', 'Her', 'Their', 'New', 'Says', 'Said']);
const PLACE_HINTS = /\b(Nepal|India|China|Tibet|Himalaya[ns]?|Switzerland|Swiss|France|Paris|Germany|Munich|Ukraine|Russia|Iran|Israel|Gaza|Ethiopia|Tigray|Pakistan|Japan|Korea|Australia|Perth|South Africa|Scotland|Jersey|New York|New Jersey|Boston|Europe|Africa|Asia|America|UK|Britain|London|Washington|Mississippi|Texas|California|Mexico|Brazil|Canada|Uttar Pradesh|Odisha|Manang)\b/g;
const PERSON_TITLES = /\b(President|Prime Minister|Minister|Pope|King|Queen|Senator|Governor|Mayor|Director|actor|actress|singer|coach|captain|striker|CEO|founder)\b/i;
const SENSITIVE_TERMS = /\b(killed|dead|deaths?|died|missing|injur\w*|victims?|abuse|murder|attack|war|strike|bomb\w*|shooting|arrest\w*|charged|trial|flood\w*|earthquake|avalanche|landslides?|fire|crash|election|referendum|vote|sanctions?)\b/i;
const TONE_RULES = [
  [/\b(killed|deaths?|died|missing|abuse|victims?|disaster|flood\w*|avalanche|landslides?|earthquake|war)\b/i, 'sombre'],
  [/\b(election|referendum|vote|minister|government|parliament|sanctions?|policy)\b/i, 'measured'],
  [/\b(win|victory|beat|record|title|champion\w*)\b/i, 'energetic'],
  [/\b(launch|unveil\w*|release\w*|announce\w*|debut)\b/i, 'curious'],
  [/\b(festival|premiere|award|masterclass|film|album|exhibition)\b/i, 'reflective']
];
const METAPHORS = {
  World: ['a landscape or skyline under changing weather', 'an architectural threshold or border landscape', 'a quiet public square at dawn'],
  Business: ['a still life of the relevant goods or infrastructure', 'graphic abstraction of flow and scale', 'an empty trading floor or port at dusk'],
  Technology: ['the device or system as a clean sculptural form', 'light through circuitry-like architecture', 'a desk still life with the product silhouette'],
  Science: ['the natural phenomenon at scale', 'instrument and horizon', 'patterns in nature'],
  Crime: ['an empty street under a streetlight', 'a closed door and weather', 'an institutional building exterior at night'],
  Sports: ['the venue and light', 'equipment in motion blur', 'a pitch or court from above'],
  Culture: ['stage light and curtain', 'material textures of the art form', 'a gallery or theatre interior'],
  'Film & TV': ['a cinema screen glow in a dark auditorium', 'a film set in soft light', 'a spotlight on an empty stage'],
  Anime: ['an original stylised landscape', 'a sketchbook and light', 'an original character-free scene'],
  Gaming: ['a luminous abstract game world', 'a controller silhouette in atmospheric light', 'an original fantasy landscape']
};

function words(s) { return String(s || '').replace(/[“”"']/g, ' ').split(/[^A-Za-z0-9&\-’]+/).filter(Boolean); }

/** Proper-noun phrases (e.g. "Pope Leo XIV", "Swiss People’s Party") from text. */
export function entitiesFrom(text) {
  const out = new Map();
  const tokens = String(text || '').split(/\s+/);
  let run = [];
  const flush = () => {
    const phrase = run.join(' ').replace(/[.,;:!?)"”’]+$/, '').replace(/^["“(]+/, '');
    if (phrase && !STOP.has(phrase) && phrase.length > 2) out.set(phrase, (out.get(phrase) || 0) + 1);
    run = [];
  };
  for (const t of tokens) {
    const clean = t.replace(/^["“(‘]+/, '');
    if (/^[A-Z][A-Za-z0-9’'\-]+[.,;:!?)"”’]*$/.test(clean) && !(run.length === 0 && STOP.has(clean.replace(/[^A-Za-z]/g, '')))) run.push(clean);
    else flush();
    if (/[.,;:!?]$/.test(t)) flush();
  }
  flush();
  return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 8);
}

/**
 * @param {{slug:string,title:string,dek?:string,section:string,risk?:string,tags?:string[],body?:string,sourceName?:string}} article
 */
export function buildBrief(article) {
  const text = [article.title, article.dek, article.body].filter(Boolean).join('\n');
  const section = DIRECTION.sections[article.section] ? article.section : 'World';
  const sensitive = article.risk === 'sensitive' || section === 'Crime' || SENSITIVE_TERMS.test(`${article.title} ${article.dek || ''}`);
  const entities = [...new Set([...(article.tags || []), ...entitiesFrom(`${article.title}. ${article.dek || ''}. ${String(article.body || '').slice(0, 1500)}`)])].slice(0, 8);
  const locations = [...new Set((text.match(PLACE_HINTS) || []))].slice(0, 4);
  const realPeople = PERSON_TITLES.test(text) || entities.some(e => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(e) && !locations.includes(e));
  const tone = (TONE_RULES.find(([re]) => re.test(text)) || [null, 'restrained'])[1];
  const mustNotDepict = [
    ...DIRECTION.unacceptable,
    ...(realPeople ? ['any recognisable likeness of the people named in the story'] : []),
    ...(sensitive ? ['victims, casualties, injuries, rescue of bodies or any scene implying specific unverified events'] : []),
    ...(/\bflags?\b|nation|country/i.test(text) ? ['national flags unless exactly correct'] : []),
    ...(/\bmap\b|border|region/i.test(text) ? ['maps or borders unless exactly correct'] : [])
  ];
  const factualConstraints = [
    `Depict only what the article supports: ${article.dek || article.title}`.slice(0, 280),
    ...(locations.length ? [`Setting, if shown, must be consistent with: ${locations.join(', ')}.`] : []),
    'Do not show outcomes, numbers or events that the article does not report.'
  ];
  const treatment = sensitive || realPeople ? 'conceptual' : 'conceptual-or-literal-object';
  const brief = {
    version: 1,
    slug: article.slug,
    section,
    subject: article.title,
    centralIdea: article.dek || article.title,
    locations,
    entities,
    realPeople,
    sensitive,
    tone,
    treatment,
    mode: 'ai-illustration',
    metaphors: METAPHORS[section],
    factualConstraints,
    mustNotDepict: [...new Set(mustNotDepict)],
    sectionDirection: DIRECTION.sections[section],
    aspectRatios: DIRECTION.aspect_ratios
  };
  brief.briefHash = createHash('sha256').update(JSON.stringify({ ...brief, briefHash: undefined })).digest('hex').slice(0, 12);
  return brief;
}

/** Image-generation prompt from a brief (not from the headline alone). */
export function promptFor(brief) {
  const lines = [
    'Create ONE premium editorial illustration for a serious international news magazine (Nuvellum).',
    `Story: ${brief.centralIdea}`,
    `Section art direction: ${brief.sectionDirection}`,
    `Tone: ${brief.tone}; ${DIRECTION.tone}`,
    `Treatment: ${brief.treatment === 'conceptual' ? 'conceptual/symbolic only — show places, objects, weather or architecture, not people or events' : 'conceptual editorial illustration; a literal object or place is acceptable'}.`,
    `Possible visual ideas (choose one, or better): ${brief.metaphors.join('; ')}.`,
    ...(brief.locations.length ? [`Setting cues: ${brief.locations.join(', ')}.`] : []),
    `Composition: ${DIRECTION.composition.join(' ')}`,
    `Lighting: ${DIRECTION.lighting}`,
    `Palette: ${DIRECTION.palette.relationship}`,
    `Style: painterly editorial illustration, clearly an illustration and not a photograph. 16:9.`,
    `Must NOT include: ${brief.mustNotDepict.join('; ')}.`,
    'No text, letters, numbers, captions, logos or watermarks anywhere in the image.'
  ];
  return lines.join('\n');
}
