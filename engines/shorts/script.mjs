// Zero-cost v1 Shorts script: article sentences only. No paraphrase model is used.
export const WORDS_PER_SECOND = 2.55;
export const MIN_SECONDS = 20;
export const MAX_SECONDS = 45;
export const END_CARD_SECONDS = 3;
export const CTA = 'Read the full story on Nuvellum.';

const words = (s) => String(s).split(/\s+/).filter(Boolean).length;
export const speechSeconds = (s) => words(s) / WORDS_PER_SECOND + 0.35;
const CONTRAST = /\b(but|despite|however|while|although|yet|even as|instead)\b/i;
const NEEDS_CONTEXT = /^(however|meanwhile|also|but|and|still|instead|yet|so|in addition|additionally|as a result|the (same|new|latest)|it|its|they|their|he|she|his|her|this|these|those|that|there)\b/i;
const PROPER = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
// Words that point back to something said earlier ("has signed such deals", "those talks"): fine inside the
// story, confusing as the first line a viewer hears.
const REFERS_BACK = /\b(such|these|those|the same|the latter|the former|similar|likewise|again|further|another)\b/i;

export function hookScore(sentence, index) {
  let score = 0;
  if (index > 0 && NEEDS_CONTEXT.test(sentence)) score -= 6;
  if (index > 0 && REFERS_BACK.test(sentence)) score -= 5;
  if (sentence.length >= 55 && sentence.length <= 180) score += 3;
  if (sentence.length > 240 && !(index === 0 && sentence.length <= 320)) score -= 4;
  if (/\d/.test(sentence)) score += 2;
  if (CONTRAST.test(sentence)) score += 1.5;
  score += Math.min(3, (sentence.match(PROPER) || []).length * .55);
  if (/[“"]/.test(sentence)) score -= 1;
  score -= index * .3;
  // A news lead is written to stand on its own; later sentences lean on it ("the practice", "the initiative").
  if (index === 0 && sentence.length <= 320) score += 4;
  return score;
}

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

export function extractiveScript(story) {
  const pool = story.sentences.slice(0, 16).map((text, i) => ({ text:norm(text), i })).filter(x => x.text.length >= 35 && x.text.length <= 280);
  if (!pool.length) throw new Error('article has no usable sentences for a short');
  const ranked = [...pool].sort((a,b) => hookScore(b.text,b.i)-hookScore(a.text,a.i));
  const hook = ranked[0];
  const budget = MAX_SECONDS - END_CARD_SECONDS - speechSeconds(CTA);
  const chosen = [hook];
  let seconds = speechSeconds(hook.text);
  for (const item of pool) {
    if (item.i === hook.i) continue;
    const add = speechSeconds(item.text);
    if (seconds + add > budget) continue;
    chosen.push(item);
    seconds += add;
    if (seconds >= 26) break;
  }
  const beats = chosen.slice(1).sort((a,b) => a.i-b.i);
  return {
    method:'extractive',
    lines:[
      { role:'hook', text:hook.text, source:hook.i },
      ...beats.map(x => ({ role:'beat', text:x.text, source:x.i })),
      { role:'cta', text:CTA, source:null }
    ]
  };
}

export function scriptSeconds(script) {
  return script.lines.reduce((sum,line)=>sum+speechSeconds(line.text),0)+END_CARD_SECONDS;
}

export function verifyScript(script, story) {
  const problems=[];
  const source = story.sentences.map(norm);
  for (const [i,line] of script.lines.entries()) {
    if (line.role === 'cta') {
      if (line.text !== CTA) problems.push('CTA changed');
      continue;
    }
    if (!Number.isInteger(line.source) || source[line.source] !== norm(line.text)) problems.push(`line ${i} is not verbatim article text`);
  }
  if (!script.lines.some(x=>x.role==='hook')) problems.push('missing hook');
  const sec=scriptSeconds(script);
  if (sec > MAX_SECONDS+.01) problems.push(`runtime ${sec.toFixed(1)}s exceeds ${MAX_SECONDS}s`);
  return problems;
}

export async function buildScript(story) {
  const script=extractiveScript(story);
  return {
    script,
    problems:verifyScript(script,story),
    notes:['extractive article-only script; no paraphrase model used']
  };
}

