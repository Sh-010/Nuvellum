// Readers should see topic-related follow-ups before the newest unrelated article in a desk.
// This selector is deterministic: no tracking, search API, or fictional "popular" ranking.
const GENERIC_TAGS = new Set([
  'world', 'business', 'technology', 'science', 'crime', 'sports', 'culture',
  'film tv', 'film', 'television', 'anime', 'gaming', 'opinion', 'news',
  'analysis', 'explainer', 'review', 'entertainment', 'lore', '2026'
]);
const STOP_WORDS = new Set([
  'about', 'after', 'ahead', 'amid', 'also', 'been', 'behind', 'between', 'could',
  'does', 'from', 'have', 'into', 'more', 'most', 'news', 'over', 'says', 'said',
  'that', 'their', 'them', 'they', 'this', 'three', 'under', 'what', 'when',
  'where', 'which', 'while', 'with', 'year', 'years', 'will', 'your', 'gets',
  'get', 'new', 'latest', 'why', 'how', 'and', 'the', 'for'
]);

const normalizedTag = (value) => String(value || '')
  .toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const subjectTags = (article) => new Set(
  (Array.isArray(article?.tags) ? article.tags : [])
    .map(normalizedTag).filter(tag => tag.length > 2 && !GENERIC_TAGS.has(tag))
);
const titleTokens = (article) => new Set(
  (String(article?.title || '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) || [])
    .filter(word => word.length >= 4 && !STOP_WORDS.has(word))
);

export function selectRelatedStories(current, articles, limit = 3) {
  const tags = subjectTags(current);
  const words = titleTokens(current);
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  return (Array.isArray(articles) ? articles : [])
    .filter(article => article && article.slug && article.slug !== current?.slug && article.status !== 'draft' && article.status !== 'review')
    .map((article, index) => {
      const otherTags = subjectTags(article);
      const tagScore = [...tags].reduce((sum, tag) => sum + (otherTags.has(tag) ? (tag.includes(' ') ? 10 : 6) : 0), 0);
      const otherWords = titleTokens(article);
      const overlaps = [...words].filter(word => otherWords.has(word)).length;
      // Two distinct matching title words reduce false matches from single generic terms.
      const topical = tagScore + (overlaps >= 2 ? 2 * overlaps : 0);
      const sameDesk = Number(article.section === current?.section);
      return { article, index, topical, sameDesk };
    })
    .sort((a, b) => b.topical - a.topical || b.sameDesk - a.sameDesk || a.index - b.index)
    .slice(0, cap)
    .map(entry => entry.article);
}
