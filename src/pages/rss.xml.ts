import type { APIRoute } from 'astro';
import { getArticles } from '../lib/articles';

const cdata = (value: string) => String(value).replace(/]]>/g, ']]]]><![CDATA[>');

export const GET: APIRoute = async ({ site }) => {
  const articles = await getArticles();
  const root = (site || new URL('https://nuvellum.vercel.app')).toString().replace(/\/$/,'');
  const items = articles.map((article) => {
    const url = `${root}/article/${article.slug}`;
    return `<item><title><![CDATA[${cdata(article.title)}]]></title><link>${url}</link><guid>${url}</guid><pubDate>${new Date(article.date+'T00:00:00Z').toUTCString()}</pubDate><description><![CDATA[${cdata(article.dek)}]]></description></item>`;
  }).join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Nuvellum</title><link>${root}</link><description>Beyond the headline.</description>${items}</channel></rss>`,
    { headers: { 'Content-Type':'application/rss+xml; charset=utf-8' } }
  );
};
