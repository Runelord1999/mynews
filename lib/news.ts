export type Topic = {name:string; keywords:string};
export type Article = {id:string; title:string; excerpt:string; url:string; source:string; date:string; topic:string; provider?:string};
export type NewsSite = {name:string;url:string;searchUrl:string};
export function siteSearchLink(site:NewsSite,keywords:string){return site.searchUrl?safeUrl(site.searchUrl.replaceAll('{query}',encodeURIComponent(keywords))):'https://www.google.com/search?q='+encodeURIComponent('site:'+new URL(site.url).hostname+' ('+keywords+')');}
export const defaults:Topic[] = ['Trump','Anthropic','OpenAI','Singularity','AGI','AI Governance'].map(name=>({name,keywords:name}));
export function safeUrl(value:string) { const u=new URL(value); if(!['http:','https:'].includes(u.protocol)||u.username||u.password) throw new Error('Use a valid HTTP or HTTPS article URL.'); return u.href; }
export function plain(value:string) { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).replace(/\s+/g,' ').trim(); }
export function parseFeed(xml:string,topic:string):Article[] { return Array.from(xml.matchAll(/<item[ >]([\s\S]*?)<\/item>/g)).slice(0,12).flatMap(m=>{const tag=(n:string)=>m[1].match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`))?.[1]||'';try {let url=safeUrl(plain(tag('link'))); const bing=new URL(url); if(bing.hostname.endsWith('bing.com')&&bing.searchParams.has('url')) url=safeUrl(bing.searchParams.get('url')!); const title=plain(tag('title')); if(!title)return []; return [{id:url,title,excerpt:plain(tag('description')).slice(0,350),url,source:plain(tag('News:Source')||tag('source'))||new URL(url).hostname.replace(/^www\./,''),date:tag('pubDate'),topic}];} catch{return [];} }); }


