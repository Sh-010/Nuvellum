const GENERIC_IMAGE_RE = /^\/(?:images\/[a-z-]+\.svg$|uploads\/house\/|generated\/(?!ai\/)[^/]+\.svg$)/i;

export function publicationTime(data) {
  const raw = data?.publishedAt || (data?.date ? `${data.date}T23:59:59Z` : '');
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function imageMode(data) {
  const image = String(data?.image || '').trim();
  if (!image || GENERIC_IMAGE_RE.test(image)) return 'text-led';
  if (data?.imageKind === 'photo' || /^\/uploads\/articles\//i.test(image)) return 'photo';
  if (/^\/generated\/ai\//i.test(image)) return 'ai-illustration';
  return 'other';
}

export function sourceHost(url) {
  try { return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function countBy(values) {
  const map = {};
  for (const value of values) {
    const key = String(value || 'unknown');
    map[key] = (map[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(map).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export function summarizeArticles(entries, now = Date.now()) {
  const published = entries.filter(x => x.data?.status === 'published');
  const automated = published.filter(x => x.data?.origin === 'automation');
  const since = (days) => automated.filter(x => {
    const t = publicationTime(x.data);
    return t !== null && now - t <= days * 86400000 && now >= t;
  });

  const sources = [];
  for (const { data } of automated) {
    for (const url of Array.isArray(data.sourceUrls) ? data.sourceUrls : []) {
      const host = sourceHost(url);
      if (host) sources.push(host);
    }
  }

  const latest = [...automated]
    .map(x => ({ ...x, time: publicationTime(x.data) }))
    .filter(x => x.time !== null)
    .sort((a,b) => b.time - a.time)[0];

  return {
    publishedTotal: published.length,
    automatedTotal: automated.length,
    published24h: since(1).length,
    published7d: since(7).length,
    published30d: since(30).length,
    latestAutomatedAt: latest ? new Date(latest.time).toISOString() : null,
    latestAutomatedSlug: latest?.slug || null,
    sections: countBy(automated.map(x => x.data.section)),
    risks: countBy(automated.map(x => x.data.risk || 'legacy')),
    imageModes: countBy(automated.map(x => imageMode(x.data))),
    sourceHosts: countBy(sources)
  };
}

export function staleHours(iso, now = Date.now()) {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (now - t) / 3600000);
}
