import type {APIRoute} from 'astro';
import {getArticles,slugify} from '../lib/articles';

export const GET:APIRoute=async({site})=>{
 const root=(site||new URL('https://nuvellum.vercel.app')).toString().replace(/\/$/,'');
 const a=await getArticles();
 const sections=[...new Set([...a.map(x=>`/section/${slugify(x.section)}`),'/section/entertainment','/section/crime'])];
 const authors=[...new Set(a.map(x=>`/author/${slugify(x.author)}`))];
 // lastmod: an article's own update/publication date; listing pages take their newest article's date.
 const day=(x)=>String(x.updated||x.date||'').slice(0,10);
 const newest=(xs)=>xs.map(day).filter(Boolean).sort().pop();
 const latest=newest(a);
 const mod=new Map();
 for(const x of a){mod.set(`/article/${x.slug}`,day(x));const s=`/section/${slugify(x.section)}`;if(!mod.get(s)||mod.get(s)<day(x))mod.set(s,day(x));const au=`/author/${slugify(x.author)}`;if(!mod.get(au)||mod.get(au)<day(x))mod.set(au,day(x));}
 for(const p of ['/','/latest','/section/entertainment','/section/crime'])if(!mod.get(p)||p==='/'||p==='/latest')mod.set(p,mod.get(p)||latest);
 const urls=['/','/latest','/about','/standards','/corrections','/contact','/advertise','/privacy','/terms',...a.map(x=>`/article/${x.slug}`),...sections,...authors];
 const unique=[...new Set(urls)];
 return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${unique.map(u=>`<url><loc>${root}${u}</loc>${mod.get(u)?`<lastmod>${mod.get(u)}</lastmod>`:''}</url>`).join('')}</urlset>`,{headers:{'Content-Type':'application/xml; charset=utf-8'}})
};
