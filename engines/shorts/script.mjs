// Short-form script: pick the most compelling TRUE angle, build a 20-45 s
// narration, verify every line against the article, fail closed to a purely
// extractive script (the article's own sentences) when anything is doubtful.
import { checkGrounding } from '../shared/grounding.mjs';
import { complete } from '../shared/providers/index.mjs';

export const WORDS_PER_SECOND = 2.6;         // calm news-read pace
export const MIN_SECONDS = 20;
export const MAX_SECONDS = 45;
export const END_CARD_SECONDS = 3;
export const CTA = 'Read the full story on Nuvellum.';

const words = (s) => String(s).split(/\s+/).filter(Boolean).length;
export const speechSeconds = (s) => words(s) / WORDS_PER_SECOND + 0.35;

const CONTRAST = /\b(but|despite|however|while|although|yet|even as|instead)\b/i;
const ATTRIBUTION_ONLY = /^(according to|the bbc|reuters|it was|this is|there (is|are|was))\b/i;
const PROPER = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g;

// Openers that only make sense after earlier context ("The organisation...", "It...").
const NEEDS_CONTEXT = /^(however|meanwhile|also|but|and|still|instead|yet|so|in (some|other|many|both) cases|in addition|additionally|as a result|at the same time|the (latest|same|new)|the (organisation|organization|group|company|charity|service|agency|firm|team|club|ministry|department|minister|official|man|woman|report|study|move|deal|plan|proposal|decision|incident|attack)|it|its|they|their|he|she|his|her|this|these|those|that|such|there)\b/i;

/** Score how well a sentence works as a hook without distorting it. */
export function hookScore(sentence, index, titleNames = []) {
  let s = 0;
  if (index > 0 && NEEDS_CONTEXT.test(sentence)) s -= 6;
  if (titleNames.some(n => sentence.includes(n))) s += 2;
  const len = sentence.length;
  if (len >= 50 && len <= 170) s += 3; else if (len > 220) s -= 3;
  if (/\d/.test(sentence)) s += 2;
  if (CONTRAST.test(sentence)) s += 1.5;
  s += Math.min(3, (sentence.match(PROPER) || []).length * 0.6);
  if (ATTRIBUTION_ONLY.test(sentence)) s -= 2;
  if (/[“"]/.test(sentence)) s -= 1;        // quotes are riskier to excerpt out of context
  s -= index * 0.35;                        // prefer the lead; later sentences need to earn it
  return s;
}

function clean(sentence) {
  return String(sentence).replace(/\s+/g, ' ').replace(/\s([,.;:])/g, '$1').trim();
}

/**
 * Deterministic extractive script: hook = best-scoring early sentence, then the
 * next strongest sentences in article order until 20-45 s is reached.
 * Every line is verbatim article text, so it is grounded by construction.
 */
export function extractiveScript(story) {
  const pool = story.sentences.slice(0, 14).map((text, i) => ({ text: clean(text), i })).filter(x => x.text.length <= 260);
  if (!pool.length) throw new Error('article has no usable sentences');
  const titleNames = (String(story.title).match(/\b[A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})*/g) || []).slice(1);
  const ranked = [...pool].sort((a, b) => hookScore(b.text, b.i, titleNames) - hookScore(a.text, a.i, titleNames));
  const hook = ranked[0];
  const budget = MAX_SECONDS - END_CARD_SECONDS - speechSeconds(CTA);
  const chosen = [hook];
  let seconds = speechSeconds(hook.text);
  for (const c of pool) {
    if (c === hook || seconds >= MIN_SECONDS + 6) continue;
    const t = speechSeconds(c.text);
    if (seconds + t > budget) continue;
    chosen.push(c); seconds += t;
  }
  const body = chosen.slice(1).sort((a, b) => a.i - b.i);
  return {
    method: 'extractive',
    lines: [{ role: 'hook', text: hook.text, source: hook.i }, ...body.map(c => ({ role: 'beat', text: c.text, source: c.i })), { role: 'cta', text: CTA }]
  };
}

export function scriptSeconds(script) {
  return script.lines.reduce((t, l) => t + speechSeconds(l.text), 0) + END_CARD_SECONDS;
}

/**
 * Verify a script against the article. Returns problems (empty = pass).
 * Checks every non-CTA line for grounding (numbers, names, quotes), hype and
 * persuasion, and the total runtime window.
 */
export function verifyScript(script, story) {
  const problems = [];
  const source = `${story.title}\n${story.dek}\n${story.text}`;
  for (const [i, line] of script.lines.entries()) {
    if (line.role === 'cta') { if (line.text !== CTA) problems.push(`line ${i}: CTA was altered`); continue; }
    const g = checkGrounding(line.text, source);
    for (const p of g.problems) problems.push(`line ${i} (${line.role}): ${p}`);
    if (!line.text.trim()) problems.push(`line ${i}: empty`);
  }
  if (!script.lines.some(l => l.role === 'hook')) problems.push('no hook');
  const secs = scriptSeconds(script);
  if (secs > MAX_SECONDS + 0.01) problems.push(`runtime ${secs.toFixed(1)}s exceeds ${MAX_SECONDS}s`);
  return problems;
}

const SYSTEM = `You write 20-45 second vertical-video scripts for Nuvellum, an independent news publication.
Goal: make viewers curious about the most compelling TRUE element of the story so they read the article. Do not retell the whole article.
Hard rules: use only facts in the ARTICLE; no new numbers, names or quotes; never invent consequences; no "this changes everything"/"you won't believe" style hype; no political persuasion, endorsements or predictions; attribute claims exactly as the article does. Presentation can be vivid; claims must be exact.`;

/**
 * Build the script. Sensitive stories (politics, conflict, crime...) always use
 * the extractive path: no model paraphrase of contested material.
 */
export async function buildScript(story, { env = process.env } = {}) {
  const notes = [];
  const fallback = extractiveScript(story);
  if (story.risk === 'sensitive') {
    notes.push('sensitive story: extractive script only (no model paraphrase)');
    return { script: fallback, notes, problems: verifyScript(fallback, story) };
  }
  try {
    const numbered = story.sentences.slice(0, 30).map((s, i) => `[${i}] ${s}`).join('\n');
    const r = await complete('shorts_script', {
      system: SYSTEM, json: true,
      prompt: `HEADLINE: ${story.title}\nDEK: ${story.dek}\nARTICLE SENTENCES:\n${numbered}\n\nReturn JSON {"hook": {"text": "...", "source": <sentence index>}, "beats": [{"text": "...", "source": <index>}], "why_this_hook": "..."}. 2-4 beats. Total spoken words 45-100. Each line must be supported by its cited sentence.`
    }, env);
    const data = JSON.parse(String(r.text).replace(/^```(json)?|```$/g, '').trim());
    const script = {
      method: `model:${r.provider}`,
      lines: [{ role: 'hook', text: clean(data.hook?.text), source: data.hook?.source }, ...(data.beats || []).map(b => ({ role: 'beat', text: clean(b.text), source: b.source })), { role: 'cta', text: CTA }]
    };
    const problems = verifyScript(script, story);
    if (scriptSeconds(script) < MIN_SECONDS - 5) problems.push('too short');
    // Optional independent model check on top of deterministic grounding.
    if (!problems.length) {
      try {
        const v = await complete('shorts_verify', {
          system: 'You are a strict fact-checker. Compare each SCRIPT line with the ARTICLE.', json: true,
          prompt: `ARTICLE:\n${story.text.slice(0, 8000)}\n\nSCRIPT LINES:\n${script.lines.map((l, i) => `${i}: ${l.text}`).join('\n')}\n\nReturn JSON {"verdict":"pass"|"fail","problems":["..."]}. Fail if any line adds, exaggerates, speculates, or changes attribution.`
        }, env);
        const vj = JSON.parse(String(v.text).replace(/^```(json)?|```$/g, '').trim());
        if (vj.verdict !== 'pass') problems.push(...(vj.problems?.length ? vj.problems : ['model verifier did not pass the script']));
        else notes.push(`independently verified by ${v.provider}`);
      } catch { notes.push('no independent model verifier available: deterministic grounding only'); }
    }
    if (!problems.length) return { script, notes: [...notes, `script by ${r.provider}`], problems: [] };
    notes.push(`model script rejected: ${problems.join('; ')}`);
  } catch (err) {
    notes.push(`no model script (${String(err.message).slice(0, 120)}): extractive script`);
  }
  return { script: fallback, notes, problems: verifyScript(fallback, story) };
}
