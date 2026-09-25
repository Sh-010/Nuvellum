export type Article = {
  slug: string;
  title: string;
  dek: string;
  section: string;
  type: string;
  author: string;
  date: string;
  readingTime: string;
  image: string;
  imageAlt: string;
  status: string;
  tags: string[];
  sourceNote?: string;
  Content: any;
};

export async function getArticles(): Promise<Article[]> {
  const modules = import.meta.glob('../content/articles/*.md', { eager: true }) as Record<string, any>;
  return Object.entries(modules)
    .map(([path, mod]) => {
      const slug = path.split('/').pop()!.replace(/\.md$/, '');
      return { slug, ...mod.frontmatter, Content: mod.Content } as Article;
    })
    .filter((a) => a.status === 'published')
    .sort((a,b) => +new Date(b.date) - +new Date(a.date));
}

export function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
