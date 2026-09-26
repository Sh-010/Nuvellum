
const source = $('Prepare Source').item.json;
// The search index may arrive as one item per article or as a single array item.
const recent = $input.all().map(i => i.json).flatMap(x => Array.isArray(x) ? x : [x]).filter(x => x && typeof x === 'object');
recent.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

const sourceKey = dedupeKey(source.sourceLink);
const exactSourceMatch = recent.some(x =>
  Array.isArray(x.sourceUrls) && x.sourceUrls.some(url => dedupeKey(url) === sourceKey)
);

return [{
  json: {
    ...source,
    normalizedSourceLink: sourceKey,
    sourceHash8: sourceHash(source.sourceLink),
    recentTitles: recent.map(x => x.title).filter(Boolean).slice(0, 60),
    exactSourceMatch
  }
}];
