import type {APIRoute} from 'astro';
import {getArticles,slugify} from '../lib/articles';

export const GET:APIRoute=async({site})=>{
 const root=(site||new URL('https://nuvellum.vercel.app')).toString().replace(/\/$/,'');
 const a=await getArticles();
 const sections=[...new Set([...a.map(x=>`/section/${slugify(x.section)}`),'/section/entertainment','/section/crime'])];
 const authors=[...new Set(a.map(x=>`/author/${slugify(x.author)}`))];
 const urls=['/','/latest','/about','/standards','/corrections','/contact','/advertise','/privacy','/terms',...a.map(x=>`/article/${x.slug}`),...sections,...authors];
 const unique=[...new Set(urls)];
 return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${unique.map(u=>`<url><loc>${root}${u}</loc></url>`).join('')}</urlset>`,{headers:{'Content-Type':'application/xml; charset=utf-8'}})
};
