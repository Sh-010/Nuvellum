
const context = $('Prepare Duplicate Context').item.json;
const raw = $input.all().map(i => i.json);
const prs = raw.flatMap(x => Array.isArray(x) ? x : [x]).filter(x => x && typeof x === 'object' && x.number);

const sourceKey = dedupeKey(context.sourceLink);
let openPrDuplicate = null;
const openPrTitles = [];

for (const pr of prs) {
  const title = String(pr.title || '').replace(/^Editorial:\s*/i, '').trim();
  if (title) openPrTitles.push(title);
  const body = String(pr.body || '');
  const matches = [...body.matchAll(/\*\*Source:\*\*\s*(https?:\/\/\S+)/g)].map(m => dedupeKey(m[1]));
  const branch = String(pr.head?.ref || '');
  if (!openPrDuplicate && (matches.includes(sourceKey) || branch.endsWith('-' + context.sourceHash8))) {
    openPrDuplicate = { number: pr.number, title: pr.title || '', html_url: pr.html_url || '' };
  }
}

return [{
  json: {
    ...context,
    normalizedSourceLink: sourceKey,
    openPrExactSourceMatch: Boolean(openPrDuplicate),
    openPrDuplicate,
    openPrTitles: [...new Set(openPrTitles)].slice(0, 100),
    exactSourceMatch: context.exactSourceMatch === true || Boolean(openPrDuplicate)
  }
}];
