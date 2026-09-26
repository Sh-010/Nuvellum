// Fact grounding: every checkable claim in generated copy (numbers, named
// entities, quotations) must appear in the source article. Deterministic,
// conservative, and model-independent: an LLM cannot talk its way past it.

const HYPE = [
  /this changes everything/i, /you won'?t believe/i, /shocking/i, /mind-?blowing/i, /game[- ]changer/i,
  /breaking:/i, /\bexposed\b/i, /\bdestroy(s|ed)?\b/i, /\bslams?\b/i, /\bchaos\b/i, /\bnightmare\b/i,
  /\bcatastroph/i, /\bunprecedented\b/i, /\bhistoric\b/i, /\bmust[- ]see\b/i, /\bgoes viral\b/i,
  /what happens next/i, /\bsecret(ly)?\b/i, /\bthe truth about\b/i, /\bwake up\b/i
];
const PERSUASION = [/\byou should (vote|support|oppose)\b/i, /\bvote (for|against)\b/i, /\b(is|are) (right|wrong) to\b/i, /\bshame(ful)?\b/i, /\bdisgrace(ful)?\b/i];

const norm = (s) => String(s).toLowerCase()
  .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/[^a-z0-9%£$€.'" -]/g, ' ').replace(/\s+/g, ' ').trim();

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100, thousand: 1000 };

function numbersIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/\d[\d,]*(\.\d+)?/g)) out.add(m[0].replace(/,/g, ''));
  for (const m of norm(text).matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|fifty|hundred|thousand)\b/g)) out.add(String(NUMBER_WORDS[m[1]]));
  return out;
}

const STOP_CAPS = new Set(['The','A','An','This','That','These','Those','It','Its','In','On','At','For','But','And','Or','If','As','By','With','From','After','Before','While','When','What','Why','How','Who','Read','Watch','Full','More','Nuvellum','Here','Now','Today','Yesterday','Tomorrow','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','Link','Story','Via']);

function entitiesIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/\b([A-Z][a-zA-Z'’.-]+(?:\s+(?:of|the|de|al|and)?\s*[A-Z][a-zA-Z'’.-]+)*)/g)) {
    const words = m[1].split(/\s+/).filter(w => !STOP_CAPS.has(w));
    if (!words.length) continue;
    for (const w of words) if (/^[A-Z]/.test(w) && w.length > 1) out.add(w.replace(/['’]s$/, '').replace(/[.]$/, ''));
  }
  return out;
}

function quotesIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/[“"]([^”"]{4,})[”"]/g)) out.push(m[1]);
  return out;
}

/**
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkGrounding(copy, sourceText, { allow = [] } = {}) {
  const problems = [];
  const src = norm(sourceText);
  const srcNumbers = numbersIn(sourceText);
  const allowed = new Set(allow.map(a => norm(a)));

  for (const n of numbersIn(copy)) if (!srcNumbers.has(n)) problems.push(`number "${n}" is not in the article`);
  for (const e of entitiesIn(copy)) {
    const k = norm(e);
    if (!k || allowed.has(k)) continue;
    if (!src.includes(k)) problems.push(`name "${e}" is not in the article`);
  }
  for (const q of quotesIn(copy)) if (!src.includes(norm(q))) problems.push(`quotation "${q.slice(0, 60)}" is not verbatim in the article`);
  for (const re of HYPE) if (re.test(copy)) problems.push(`sensational phrasing: ${re}`);
  for (const re of PERSUASION) if (re.test(copy)) problems.push(`persuasive/political phrasing: ${re}`);
  return { ok: problems.length === 0, problems };
}
