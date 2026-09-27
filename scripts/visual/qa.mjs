// Visual QA: technical checks plus a vision-model rubric, combined into a weighted score with
// hard minimums. Stricter for sensitive stories. Anything below threshold is rejected; if no
// candidate passes, the engine uses the deterministic SVG fallback.
import { DIRECTION } from './brief.mjs';

const Q = DIRECTION.qa;

export function technicalCheck(img) {
  const problems = [];
  if (!img?.bytes?.length) problems.push('empty image');
  if (img?.mime && !/^image\/(png|jpeg|webp|avif|svg\+xml)$/.test(img.mime)) problems.push(`unsupported type ${img.mime}`);
  if (img?.bytes?.length > 12 * 1024 * 1024) problems.push('larger than 12 MB');
  const dims = dimensions(img);
  if (dims && img.mime !== 'image/svg+xml') {
    if (dims.width < 1024) problems.push(`too small (${dims.width}px wide)`);
    const r = dims.width / dims.height;
    if (r < 1.2 || r > 2.1) problems.push(`aspect ratio ${r.toFixed(2)} does not suit a 16:9 master`);
  }
  return { ok: problems.length === 0, problems, dims };
}

/** PNG/JPEG/WebP dimensions from the header (no image library needed). */
export function dimensions(img) {
  const b = img?.bytes;
  if (!b || b.length < 24) return null;
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
    return null;
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const n = b.readUInt32LE(21); return { width: 1 + (n & 0x3fff), height: 1 + ((n >> 14) & 0x3fff) }; }
  }
  if (img.mime === 'image/svg+xml') {
    const vb = b.toString('utf8', 0, 600).match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/);
    return vb ? { width: +vb[1], height: +vb[2] } : null;
  }
  return null;
}

/** Rubric sent to the vision model; the reply must be JSON with these fields (0-10). */
export function rubricPrompt(brief) {
  return [
    'You are the photo editor of a serious international news magazine. Judge this candidate editorial illustration strictly.',
    `Story: ${brief.centralIdea}`,
    `Section: ${brief.section}. Sensitive story: ${brief.sensitive ? 'yes' : 'no'}.`,
    `It must NOT include: ${brief.mustNotDepict.join('; ')}.`,
    'Return JSON only:',
    '{"relevance":0-10,"composition":0-10,"technical":0-10,"factual_safety":0-10,"brand":0-10,"artifacts":0-10,"headline_fit":0-10,"mobile_crop":0-10,"photoreal_risk":0-10,"has_text_or_logos":true|false,"shows_identifiable_person":true|false,"reasons":["short"]}',
    'artifacts: 10 = no AI artifacts. photoreal_risk: 10 = could be mistaken for a real news photograph. brand: restrained, premium, magazine-quality, not stock.'
  ].join('\n');
}

export function parseRubric(text) {
  let s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  const r = JSON.parse(s);
  for (const k of Q.dimensions) { const v = Number(r[k]); if (!Number.isFinite(v) || v < 0 || v > 10) throw new Error(`rubric field ${k} invalid`); r[k] = v; }
  r.photoreal_risk = Number(r.photoreal_risk);
  if (!Number.isFinite(r.photoreal_risk)) throw new Error('rubric photoreal_risk invalid');
  return r;
}

/** Combine rubric scores into a decision. Fails closed on anything missing or unsafe. */
export function decide(rubric, brief) {
  const reasons = [];
  if (!rubric) return { pass: false, score: 0, reasons: ['no QA rubric'] };
  const score = Q.dimensions.reduce((sum, k) => sum + rubric[k] * Q.weights[k], 0);
  const threshold = brief.sensitive ? Q.sensitive_threshold : Q.threshold;
  if (score < threshold) reasons.push(`score ${score.toFixed(2)} below ${threshold}`);
  for (const [k, min] of Object.entries(Q.hard_minimums)) if (rubric[k] < min) reasons.push(`${k} ${rubric[k]} below ${min}`);
  const maxPhoto = brief.sensitive ? Q.max_photoreal_risk_sensitive : Q.max_photoreal_risk;
  if (rubric.photoreal_risk > maxPhoto) reasons.push(`photoreal_risk ${rubric.photoreal_risk} above ${maxPhoto}`);
  if (rubric.has_text_or_logos === true) reasons.push('contains text or logos');
  if (rubric.shows_identifiable_person === true && (brief.realPeople || brief.sensitive)) reasons.push('shows an identifiable person');
  return { pass: reasons.length === 0, score: Math.round(score * 100) / 100, threshold, reasons };
}

/** Pick the highest-scoring passing candidate, or null. */
export function selectBest(scored) {
  return scored.filter(c => c.decision?.pass).sort((a, b) => b.decision.score - a.decision.score)[0] || null;
}
