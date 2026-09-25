import type { APIRoute } from 'astro';
import { getArticles } from '../lib/articles';

export const GET: APIRoute = async () => {
  const articles = await getArticles();
  const payload = articles.map(({ Content, getHeadings, ...article }) => article);
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
};
