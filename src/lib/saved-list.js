// The reader's saved stories ("reading list"), kept in this browser under one key shared by article pages,
// homepage cards and /saved. Entries come in two shapes, both still written today and both kept as they are:
//   { title, url }        homepage cards (and every save made before article pages carried a category)
//   { title, cat, url }   article pages; cat is "Section · Format"
// A story is identified by its title, which is what the save buttons compare; the URL opens it.
export const SAVED_KEY = 'nuvellum-saved-v2';
export const SAVED_LIMIT = 80;

/** Site path of a saved URL: "/article/<slug>" for our own stories (absolute URLs from any Nuvellum host
 *  included), otherwise '' so a malformed or foreign entry never becomes a link. */
export function savedPath(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try { path = new URL(raw).pathname; } catch { return ''; }
  }
  const m = path.match(/^\/article\/([^/?#]+)\/?/);
  return m ? `/article/${m[1]}` : '';
}

export function savedSlug(url) {
  const path = savedPath(url);
  if (!path) return '';
  try { return decodeURIComponent(path.slice('/article/'.length)); } catch { return path.slice('/article/'.length); }
}

/** Parsed reading list: unreadable storage is an empty list; entries without a title are dropped; the same
 *  story saved twice (both writers compare titles, but older builds did not always) is shown once. */
export function parseSaved(raw) {
  let list;
  try { list = JSON.parse(raw || '[]'); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const title = String(x.title || '').trim();
    if (!title) continue;
    const id = title.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...x, title });
  }
  return out;
}

/** Remove one story (by title, as the save buttons do) from the stored list, leaving every other entry
 *  exactly as it was written. */
export function withoutSaved(raw, title) {
  let list;
  try { list = JSON.parse(raw || '[]'); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const id = String(title || '').trim().toLowerCase();
  return list.filter((x) => !(x && String(x.title || '').trim().toLowerCase() === id));
}

/** What a row shows, from the saved entry and (when available) the published story in /search-index.json.
 *  The index wins because it is current; the entry's own "Section · Format" covers stories it lacks. */
export function savedRow(entry, bySlug = new Map()) {
  const slug = savedSlug(entry.url);
  const story = (slug && bySlug.get(slug)) || null;
  const [catSection, catType] = String(entry.cat || '').split('·').map((s) => s.trim());
  const href = story ? `/article/${encodeURIComponent(story.slug)}` : savedPath(entry.url);
  return {
    title: story?.title || entry.title,
    href,
    section: story?.section || catSection || '',
    type: story?.type || catType || '',
    readingTime: story?.readingTime || '',
    dek: story?.dek || '',
    removeTitle: entry.title
  };
}
