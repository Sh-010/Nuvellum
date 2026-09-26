export type ArticleHeading = {
  depth: number;
  slug: string;
  text: string;
};

export type Article = {
  slug: string;
  title: string;
  dek: string;
  section: string;
  type: string;
  author: string;
  date: string;
  /** ISO 8601 timestamp; orders same-day stories. Optional for older articles. */
  publishedAt?: string;
  updated?: string;
  readingTime: string;
  image: string;
  imageAlt: string;
  status: string;
  tags: string[];
  sourceNote?: string;
  sourceUrls?: string[];
  origin?: 'manual' | 'automation';
  risk?: 'low' | 'sensitive';
  reviewedBy?: string;
  Content: any;
  getHeadings?: () => ArticleHeading[] | Promise<ArticleHeading[]>;
};

export async function getArticles(): Promise<Article[]> {
  const modules = import.meta.glob('../content/articles/*.md', { eager: true }) as Record<string, any>;
  return Object.entries(modules)
    .map(([path, mod]) => {
      const slug = path.split('/').pop()!.replace(/\.md$/, '');
      const article = {
        slug,
        ...mod.frontmatter,
        Content: mod.Content,
        getHeadings: mod.getHeadings
      } as Article;
      if (article.origin === 'automation') {
        const hasCustomEditorialImage = typeof article.image === 'string'
          && article.image.trim()
          && !article.image.startsWith('/images/');
        if (!hasCustomEditorialImage) article.image = `/generated/${slug}.svg`;
        if (!article.imageAlt) article.imageAlt = `Original Nuvellum editorial illustration for ${article.title}`;
      }
      return article;
    })
    .filter((a) => a.status === 'published')
    // Newest first. publishedAt (if present) breaks same-day ties; articles
    // without it keep their previous relative order (stable sort).
    .sort((a,b) => (+new Date(b.date) - +new Date(a.date)) || (+new Date(b.publishedAt || 0) - +new Date(a.publishedAt || 0)));
}

export function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
