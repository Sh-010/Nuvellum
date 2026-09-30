// Georgia metrics and greedy wrap from the v1 cards, kept for callers and tests that still import them from
// render.mjs. The v2 card system measures the embedded Newsreader font instead (fit.mjs).
const ADVANCE = {
  bold: [254,376,510,703,641,879,799,269,447,447,482,703,328,379,328,472,701,490,626,625,649,599,648,554,676,648,367,367,703,703,703,548,967,758,757,715,834,721,671,807,913,446,595,817,686,1023,839,820,701,820,797,649,684,833,762,1126,809,732,689,447,472,447,703,703,500,596,646,531,663,572,393,577,680,354,346,632,344,1016,690,636,658,648,520,513,397,677,567,863,588,562,525,500,388,500,703],
  italic: [241,331,412,643,610,817,710,215,375,375,472,643,270,374,270,469,614,430,559,552,565,528,566,497,596,566,384,384,643,643,643,479,929,671,654,642,749,653,599,725,815,390,518,694,604,927,767,730,610,730,702,561,619,756,667,976,710,615,602,375,469,375,643,643,500,573,554,454,575,472,329,573,563,297,291,528,285,879,590,537,578,555,461,431,347,575,538,822,501,560,444,430,375,430,643]
};
const FIT = 0.94;

export function textWidth(text, size, face = 'bold') {
  const table = ADVANCE[face];
  let em = 0;
  for (const ch of String(text).normalize('NFD')) {
    const code = ch.codePointAt(0);
    if (code >= 0x300 && code <= 0x36f) continue;
    em += code >= 32 && code <= 126 ? table[code - 32] : ch === '‘' || ch === '’' ? table[39 - 32] : ch === '“' || ch === '”' ? table[34 - 32] : ch === '…' ? 1000 : 600;
  }
  return em / 1000 * size;
}

export function wrap(text, maxWidth, size, maxLines, face = 'bold') {
  const limit = maxWidth * FIT;
  const fits = s => textWidth(s, size, face) <= limit;
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++];
    while (i < words.length && fits(line + ' ' + words[i])) line += ' ' + words[i++];
    lines.push(line);
  }
  if (i < words.length && lines.length) {
    let last = lines[lines.length - 1].replace(/[\s,;:.…-]+$/, '');
    while (!fits(last + '…') && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' ')).replace(/[\s,;:.-]+$/, '');
    lines[lines.length - 1] = last + '…';
  }
  return lines;
}
