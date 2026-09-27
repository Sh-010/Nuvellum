// Extract and check an SVG returned by a text model. Uses the repository's strict validator
// (scripts/lib/svg-safety.mjs): unsafe output is rejected, never "cleaned".
import { validateSvg } from '../lib/svg-safety.mjs';

export function sanitizeSvg(raw) {
  let s = String(raw || '').trim().replace(/^```(?:svg|xml)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const start = s.indexOf('<svg');
  const end = s.lastIndexOf('</svg>');
  if (start < 0 || end < start) return { ok: false, reason: 'malformed', detail: 'no complete <svg> element' };
  s = s.slice(start, end + 6);
  if (!/\sxmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(s.slice(0, s.indexOf('>') + 1))) s = s.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  const problems = validateSvg(s, 'candidate');
  // Brand rule: no typography inside artwork (the page supplies all type).
  if (/<\s*(text|tspan|textPath)\b/i.test(s)) problems.push('candidate: text elements are not allowed in editorial art');
  if (!/<(path|rect|circle|ellipse|polygon|polyline|line)\b/i.test(s)) problems.push('candidate: no drawable shapes');
  if (problems.length) return { ok: false, reason: 'unsafe', detail: problems.slice(0, 3).join('; ') };
  return { ok: true, svg: s };
}
