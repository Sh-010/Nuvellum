// n8n's Code sandbox does not expose the URL global, so source URLs are parsed by hand.
function parseSourceUrl(value) {
  const match = String(value || '').trim().match(/^(https?):\/\/([^\/?#\s]+)(\/[^?#\s]*)?(\?[^#\s]*)?(#[^\s]*)?$/i);
  if (!match || match[2].includes('@')) throw new Error('Invalid public source URL');
  const parts = match[2].toLowerCase().match(/^([a-z0-9.-]+)(?::(\d+))?$/i);
  if (!parts) throw new Error('Invalid source host');
  return { protocol: match[1].toLowerCase(), hostname: parts[1], port: parts[2] || '', pathname: match[3] || '/', search: match[4] || '' };
}
const TRACKING_PARAM = /^(utm_[a-z0-9_]*|fbclid|gclid|dclid|msclkid|yclid|igshid|mc_cid|mc_eid|_ga|_gl|__source|at_[a-z0-9_]*|cmp|cmpid|intcmp|ocid|ns_[a-z0-9_]*|ref|ref_src|referrer|src|source|smid|taid|partner|mod|traffic_source|ito|xtor|s_cid|sr_share|guccounter|guce_[a-z_]*|rss|feed|feedname|ftag|dcmp|cid|eid|mbid|spm|share|sh|maca|wt_[a-z0-9_]*|wt.[a-z0-9_.]*|cmpid|emc|ICID|icid|ftcamp|segmentid|mkt_tok|oly_[a-z_]*|rb_clickid|s_kwcid|vero_[a-z_]*|trk|trkCampaign)$/i;
// Canonical form for sourceUrls: https, lowercase host, no fragment, no tracking params, no trailing slash.
function canonicalSourceUrl(value) {
  try {
    const u = parseSourceUrl(value);
    const kept = u.search.replace(/^\?/, '').split('&').filter(p => p && !TRACKING_PARAM.test(decodeURIComponent(p.split('=')[0] || '')));
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return 'https://' + u.hostname + (u.port && u.port !== '443' && u.port !== '80' ? ':' + u.port : '') + path + (kept.length ? '?' + kept.join('&') : '');
  } catch {
    return String(value || '').trim().replace(/#.*$/, '').replace(/\/+$/, '');
  }
}
// Dedupe key: matches the repository validator (query and fragment ignored entirely).
function dedupeKey(value) {
  try {
    const u = parseSourceUrl(value);
    return 'https://' + u.hostname.replace(/^www\./, '') + (u.pathname.replace(/\/+$/, '') || '/');
  } catch {
    return String(value || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^http:/i, 'https:').replace(/:\/\/www\./i, '://');
  }
}
function hostOf(value) {
  try { return parseSourceUrl(value).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function pathOf(value) {
  try { return parseSourceUrl(value).pathname.toLowerCase(); } catch { return ''; }
}
// Stable 8-hex id for a source; used as the branch suffix so one source always maps to one branch.
function sourceHash(value) {
  const str = dedupeKey(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
