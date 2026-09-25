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
      return {
        slug,
        ...mod.frontmatter,
        Content: mod.Content,
        getHeadings: mod.getHeadings
      } as Article;
    })
    .filter((a) => a.status === 'published')
    .sort((a,b) => +new Date(b.date) - +new Date(a.date));
}

export function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
